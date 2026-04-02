with open('/app/src/api-client.ts', 'r') as f:
    content = f.read()

# remove the lines appended at the bottom
lines = content.split('\n')
clean_lines = []
skip = False
for line in lines:
    if line.strip() == '// --- Agent Planning Methods ---':
        skip = True
    if not skip:
        clean_lines.append(line)
content = '\n'.join(clean_lines)

new_methods = """
  // --- Agent Planning Methods ---
  async generatePlan(projectId: string, prompt: string, branchName?: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, branchName }),
    });
    if (!res.ok) throw new Error('Failed to generate plan');
    return res.json();
  },

  async getPlanStatus(projectId: string, planId: string) {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/plans/${planId}`);
    if (!res.ok) throw new Error('Failed to fetch plan status');
    return res.json();
  }
"""

# Insert before the last closing brace
last_brace_index = content.rfind('};')
if last_brace_index != -1:
    content = content[:last_brace_index] + ",\n" + new_methods + "\n" + content[last_brace_index:]

with open('/app/src/api-client.ts', 'w') as f:
    f.write(content)
