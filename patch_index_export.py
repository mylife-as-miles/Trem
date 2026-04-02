import re

with open('/app/worker/src/index.ts', 'r') as f:
    content = f.read()

# Make sure we export PlanWorkflow at the top
if 'export { PlanWorkflow }' not in content:
    content = "export { PlanWorkflow } from './workflows/plan-workflow';\n" + content

with open('/app/worker/src/index.ts', 'w') as f:
    f.write(content)
