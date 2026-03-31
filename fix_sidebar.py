import re
import os

file_path = r'c:\Users\MILES\Documents\Trem\src\components\layout\Sidebar.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_code_n = """      // If we deleted the active project, move to high-level view
      if (repoData?.id && String(repoData.id) === String(id)) {
        onNavigate('trem-edit');
      }"""
old_code_rn = old_code_n.replace('\n', '\r\n')

new_code = """      // If we deleted the active project, move to high-level view
      if (repoData?.id && String(repoData.id) === String(id)) {
        onNavigate('trem-edit');
      } else if (type === 'cf' && window.location.pathname.includes(`/create-repo/${id}`)) {
        onNavigate('trem-edit');
      }"""

content = content.replace(old_code_n, new_code)
content = content.replace(old_code_rn, new_code)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Sidebar updated")
