import core from '@actions/core';
import fs from 'node:fs';
import path from 'node:path';
import {request} from 'undici';

const STARTING_VERSION = 2850;
const ENDING_VERSION = 3200;
const SUB_ID_MAX = 20;

let json_path = path.join('bgscripts', 'bgscripts.json');
let json_arr_old = [];
let json_arr = [];

async function get_script_sub(version, subId)
{
	const RPF_URL = `https://prod.cloud.rockstargames.com/titles/gta5/pcros/bgscripts/bg_ng_${version}_${subId}.rpf`;
	let response;
	
	for (let tries = 1; tries <= 3; tries++)
	{
		response = await request(RPF_URL);
		if (response.statusCode === 200)
		{
			break;
		}
		else if (response.statusCode !== 404 && response.statusCode !== 500)
		{
			if (tries == 3)
			{
				core.setFailed(`Failed to fetch bgscript: ${response.statusCode} @ ${RPF_URL}`);
			}
			else
			{
				core.info(`Failed to fetch bgscript: ${response.statusCode} @ ${RPF_URL}, retrying`);
				continue;
			}
		}
		return;
	}

	const bgScriptName = `bg_ng_${version}_${subId}`;

	if (!fs.existsSync('bgscripts'))
	{
		fs.mkdirSync('bgscripts');
	}
	const rpfPath = path.join('bgscripts', bgScriptName);
	if (!fs.existsSync(rpfPath))
	{
		fs.mkdirSync(rpfPath);
	}
	if (!fs.existsSync(path.join(rpfPath, 'last-modified.txt')))
	{
		fs.writeFileSync(path.join(rpfPath, 'last-modified.txt'), 'Thu, 01 Jan 1970 00:00:00 GMT');
	}

	if (response.headers['content-type'] !== 'application/octet-stream')
	{
		core.setFailed(`${bgScriptName}: Invalid content-type: ${response.headers['content-type']}`);
		return;
	}

	const lastModified = response.headers['last-modified'];
	const lastModifiedDate = new Date(lastModified);

	if (lastModifiedDate.toString() === 'Invalid Date')
	{
		core.setFailed(`${bgScriptName}: Invalid last-modified date: ${lastModified}`);
		return;
	}

	const lastModifiedFile = path.join(rpfPath, 'last-modified.txt');
	const lastModifiedFileDate = new Date(fs.readFileSync(lastModifiedFile, 'utf8'));

	if (lastModifiedFileDate.toString() === 'Invalid Date')
	{
		core.setFailed(`${bgScriptName}: Invalid last-modified date in file: ${lastModifiedFileDate}`);
		return;
	}

	if (lastModifiedDate.getTime() === lastModifiedFileDate.getTime())
	{
		core.info(`${bgScriptName}: Script is up to date`);
		return;
	}

	core.info(`New script available at ${RPF_URL}`);

	// get content as buffer
	const buffer = Buffer.from(await response.body.arrayBuffer());

	const fileNameDate = lastModifiedDate.toISOString().replaceAll(':', '-');
	const fileName = `${bgScriptName}-${fileNameDate}.rpf`;
	const filePath = path.join(rpfPath, fileName);

	fs.writeFileSync(filePath, buffer);

	fs.writeFileSync(lastModifiedFile, lastModified);

	json_arr.push({name: bgScriptName, files: [filePath]});
}

function get_script(version)
{
	let arr = [];
	for (let subId = 0; subId <= SUB_ID_MAX; subId++)
	{
		arr.push(get_script_sub(version, subId));
	}
	return arr;
}

async function main()
{
	if (fs.existsSync(json_path))
	{
		try
		{
			json_arr_old = JSON.parse(fs.readFileSync(json_path, 'utf8'));
		}
		catch (e)
		{
			core.info('Bad Json format');
			json_arr_old = [];
		}
	}

	core.info('Fetching start');
	let last = STARTING_VERSION;
	for (let version = STARTING_VERSION; version <= ENDING_VERSION; version++)
	{
		await Promise.all(get_script(version));
		if (version !== last && version % 100 === 0)
		{
			core.info(`Fetching version ${last} - ${version} finished`);
			last = version;
		}
	}
}

main().then(() =>
            {
	            core.info('Fetching scripts finished');

	            let script_map = new Map();
	            for (let obj of json_arr_old)
	            {
		            script_map.set(obj.name, obj.files);
	            }
	            for (let obj of json_arr)
	            {
		            let set = new Set(script_map.get(obj.name));
		            for (let file of obj.files)
		            {
			            set.add(file);
		            }
		            if (!script_map.get(obj.name))
		            {
			            script_map.set(obj.name, []);
		            }
		            script_map.set(obj.name, Array.from(set));
	            }

	            let json = [];
	            script_map.forEach((value, key) => json.push({name: key, files: value}));

	            fs.writeFileSync(json_path, JSON.stringify(json));
            });
