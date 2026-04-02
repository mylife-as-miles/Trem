import re

with open('/app/worker/src/index.ts', 'r') as f:
    content = f.read()

# Add PLAN_WORKFLOW to the Env type
content = re.sub(
    r'(type Env = \{[^\}]*)(?=\})',
    r'\1  PLAN_WORKFLOW: any;\n',
    content
)

with open('/app/worker/src/index.ts', 'w') as f:
    f.write(content)
