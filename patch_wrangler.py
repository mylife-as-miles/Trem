import json

with open('/app/worker/wrangler.json', 'r') as f:
    data = json.load(f)

if 'workflows' not in data:
    data['workflows'] = []

# Check if plan workflow already exists
exists = False
for wf in data['workflows']:
    if wf.get('name') == 'plan-workflow':
        exists = True
        break

if not exists:
    data['workflows'].append({
        "name": "plan-workflow",
        "binding": "PLAN_WORKFLOW",
        "class_name": "PlanWorkflow"
    })

with open('/app/worker/wrangler.json', 'w') as f:
    json.dump(data, f, indent=2)
