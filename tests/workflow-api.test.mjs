import test from "node:test";
import assert from "node:assert/strict";
const base=process.env.WORKFLOW_TEST_URL;
test("shared summary access, updates, privacy, and revocation",{skip:!base},async()=>{
 const target = new URL(base); assert.equal(target.protocol, "http:"); assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
 const id=crypto.randomUUID(); const url=base+"/api/job-summary/"+id; const key="a".repeat(64);
 const summary={jobId:"TEST-QR",client:"Test client",location:"Test location",sampling:"Wellhead Sampling",sampleCount:2,sampleTypes:[{label:"Wellhead",count:2}],nodes:[{id:"created",label:"Job created",state:"done",notes:"SECRET"}],history:[],updatedAt:new Date().toISOString(),scopeMissing:false,measurements:"SECRET"};
 const put=(revision,audience="link",token=key,payload=summary)=>fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({summary:payload,revision,audience})});
 try {
 assert.equal((await fetch(url)).status,404);
 assert.equal((await fetch(url,{method:"PUT",body:"{}"})).status,401);
 let response=await put(0); assert.equal(response.status,200,await response.clone().text()); assert.equal((await response.json()).revision,1);
 assert.equal((await put(0)).status,200,"lost-response create retries are idempotent");
 response=await fetch(url); assert.equal(response.status,200); assert.doesNotMatch(await response.text(),/SECRET|edit_hash|editHash/);
 assert.equal((await put(1,"link","b".repeat(64))).status,409);
 assert.equal((await put(1,"signed-in")).status,200);
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url,{headers:{"oai-authenticated-user-id":"local-test"}})).status,200);
 assert.equal((await put(1,"link")).status,409,"stale revision cannot overwrite a newer summary");
 const updated={...summary,nodes:[{id:"created",label:"Job created",state:"active"}]};
 assert.equal((await put(2,"link",key,updated)).status,200);
 assert.equal((await (await fetch(url)).json()).summary.nodes[0].state,"active");
 assert.equal((await fetch(url,{method:"DELETE",headers:{Authorization:"Bearer "+"b".repeat(64)}})).status,403);
 assert.equal((await fetch(url)).status,200);
 } finally { await fetch(url,{method:"DELETE",headers:{Authorization:"Bearer "+key}}); }
 assert.equal((await fetch(url)).status,404);
});
