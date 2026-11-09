import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const base=fileURLToPath(new URL('../../scripts/',import.meta.url));
const setup=path.join(base,'configurar-homologacao-dev.mjs');
const check=path.join(base,'verificar-homologacao-dev.mjs');
const work=mkdtempSync(path.join(tmpdir(),'iacra-dev-local-'));
const publicDummyKey='sb_publishable_'+ 'a'.repeat(32);
const run=(entry, env={})=>spawnSync(process.execPath,[entry],{
 cwd:work, encoding:'utf8', env:{PATH:process.env.PATH,IACRA_DEV_PUBLISHABLE_KEY:publicDummyKey,...env}
});
try {
 assert.notEqual(run(check).status,0,'não iniciar sem .env');
 assert.equal(run(setup).status,0,'gera .env fictício apenas em pasta temporária');
 const content=readFileSync(path.join(work,'.env'),'utf8');
 assert.match(content,/xuyimfugcdkqovqelrfz/);
 assert.doesNotMatch(content,/ldumzwrwbhjtrnlioigg/);
 assert.equal(run(check).status,0,'configuração DEV passa');
 assert.notEqual(run(setup).status,0,'não sobrescrever .env');
 writeFileSync(path.join(work,'.env'),content.replaceAll('xuyimfugcdkqovqelrfz','ldumzwrwbhjtrnlioigg'));
 assert.notEqual(run(check).status,0,'configuração PROD é bloqueada');
 writeFileSync(path.join(work,'.env'),content.replace('sb_publishable_','sb_secret_'));
 assert.notEqual(run(check).status,0,'chave secreta é bloqueada');
 console.log('PASS: homologação Codespaces isolada, fail-closed, sem produção e sem acesso de rede.');
} finally {
 rmSync(work,{recursive:true,force:true});
}
