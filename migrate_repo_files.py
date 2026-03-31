import re
import os

file_path = r'c:\Users\MILES\Documents\Trem\src\dashboard\repo\RepoFilesPage.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state
if 'const [unsavedChangesDialog' not in content:
    content = content.replace("const [newItemName, setNewItemName] = useState('');", "const [newItemName, setNewItemName] = useState('');\n    const [unsavedChangesDialog, setUnsavedChangesDialog] = useState<FileNode | null>(null);")

# 2. Replace window.confirm
old_confirm_n = """                                if (isDirty && !window.confirm("Unsaved changes.")) return;
                                setSelectedFile(node);
                                setEditorContent(node.content || '');
                                setIsDirty(false);"""
old_confirm_rn = old_confirm_n.replace('\n', '\r\n')
new_confirm = """                                if (isDirty) {
                                    setUnsavedChangesDialog(node);
                                    return;
                                }
                                setSelectedFile(node);
                                setEditorContent(node.content || '');
                                setIsDirty(false);"""
content = content.replace(old_confirm_n, new_confirm)
content = content.replace(old_confirm_rn, new_confirm)

# 3. Add AlertDialog at the end
if 'isOpen={!!unsavedChangesDialog}' not in content:
    alert_dialog = """
            <AlertDialog
                isOpen={!!unsavedChangesDialog}
                title="Unsaved Changes"
                description="You have unsaved changes in the current file. Are you sure you want to discard them and open another file?"
                confirmText="Discard Changes"
                cancelText="Cancel"
                type="danger"
                onConfirm={() => {
                    if (unsavedChangesDialog) {
                        setSelectedFile(unsavedChangesDialog);
                        setEditorContent(unsavedChangesDialog.content || '');
                        setIsDirty(false);
                        setUnsavedChangesDialog(null);
                    }
                }}
                onCancel={() => setUnsavedChangesDialog(null)}
            />"""
    content = re.sub(r'(</div\>\s*\);\s*};\s*export default RepoFilesView;)', alert_dialog + r'\n        \1', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("RepoFilesPage updated")
