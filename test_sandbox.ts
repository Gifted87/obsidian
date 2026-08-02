import { runCodeInSandbox } from './src/lib/sandbox.ts';
import { CodeRequest } from './src/lib/types.ts';
import { randomUUID } from 'crypto';

function makeReq(language: 'python3' | 'javascript', code: string): CodeRequest {
  return { id: randomUUID(), language, code, createdAt: Date.now(), status: 'pending' };
}

async function main() {
  console.log("Running Sandbox Tests (CodeRequest API)\n");

  console.log("Test 1: Simple Python Script");
  const pyCode = `
print("Hello from Python sandbox!")
for i in range(5):
    print(f"Num: {i}")
  `;
  const pyRes = await runCodeInSandbox(makeReq('python3', pyCode));
  console.log("Python Result:", pyRes);
  console.log("Exit code:", pyRes.exitCode, "| Elapsed:", pyRes.elapsedMs, "ms");
  console.log("------------------------");

  console.log("Test 2: Simple Node Script");
  const nodeCode = `
console.log("Hello from Node sandbox!");
[0, 1, 2, 3, 4].forEach(i => console.log(\`Num: \${i}\`));
  `;
  const nodeRes = await runCodeInSandbox(makeReq('javascript', nodeCode));
  console.log("Node Result:", nodeRes);
  console.log("Exit code:", nodeRes.exitCode, "| Elapsed:", nodeRes.elapsedMs, "ms");
  console.log("------------------------");

  console.log("Test 3: Python Syntax Error");
  const pyErrCode = `
print("Hello)
  `;
  const pyErrRes = await runCodeInSandbox(makeReq('python3', pyErrCode));
  console.log("Python Error Result:", pyErrRes);
  console.log("Exit code:", pyErrRes.exitCode);
  console.log("------------------------");

  console.log("Test 4: Python Timeout (2s)");
  const pyTimeoutCode = `
import time
while True:
    time.sleep(1)
  `;
  const pyTimeoutRes = await runCodeInSandbox(makeReq('python3', pyTimeoutCode), 2000);
  console.log("Python Timeout Result:", pyTimeoutRes);
  console.log("Exit code:", pyTimeoutRes.exitCode, "(expected 124)");
  console.log("------------------------");
}

main().catch(console.error);
