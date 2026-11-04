import {inspect} from './connection.mjs';
try {
 if(process.argv.length!==3)throw Error('Usage: node scripts/doctor.mjs ABSOLUTE_CONFIG');
 console.log(JSON.stringify(await inspect(process.argv[2]),null,2));
}catch(error){console.error(JSON.stringify({schema_version:1,status:'error',message:String(error),next:'Check Node 24+, matching native/MCP delivery, paths and installed skill. Do not replace compatibility hashes.'},null,2));process.exitCode=1;}
