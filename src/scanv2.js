import core from '@actions/core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {request} from 'undici';

const STARTING_VERSION = 0;
const ENDING_VERSION = 3000;
const SUB_ID_MAX = 10;

async function get_script_sub(version, subId)
{
	const RPF_URL = `https://prod.cloud.rockstargames.com/titles/gta5/pcros/bgscripts/bg_ng_${version}_${subId}.rpf`;

	try
	{
		const response = await request(RPF_URL);
		if (response.statusCode !== 200)
		{
			if (response.statusCode !== 404)
			{
				console.log(`Failed to fetch bgscript: ${response.statusCode} @ ${RPF_URL}`);
			}
			return;
		}

		const bgScriptName = `bg_ng_${version}_${subId}`;

		console.log(`Found bgscript @ ${RPF_URL}`);

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
			core.info(`${bgScriptName}: bgscript is up to date`);
			return;
		}

		core.info(`${bgScriptName}: New bgscript available`);

		// get content as buffer
		const buffer = Buffer.from(await response.body.arrayBuffer());

		const fileNameDate = lastModifiedDate.toISOString().replaceAll(':', '-');
		const fileName = `${fileNameDate}-${crypto.createHash('sha256').update(buffer).digest('hex')}.rpf`;

		fs.writeFileSync(path.join(rpfPath, fileName), buffer);

		fs.writeFileSync(lastModifiedFile, lastModified);
	}
	catch (error)
	{
		console.log(error);
	}
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
	console.log(`Fetching start`);

	let last = 0;
	for (let version = STARTING_VERSION; version <= ENDING_VERSION; version++)
	{
		await Promise.all(get_script(version));
		if (version !== last && version % 100 === 0)
		{
			console.log(`Fetching version ${last} - ${version} finished`);
			last = version;
		}
	}
}

main().then(() => console.log(`Fetching Scripts Finished`));
