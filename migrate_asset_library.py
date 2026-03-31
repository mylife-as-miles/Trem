import re
import os

file_path = r'c:\Users\MILES\Documents\Trem\src\dashboard\assets\AssetLibraryPage.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import
if 'import AlertDialog from' not in content:
    content = content.replace("import TopNavigation from '../../components/layout/TopNavigation';", "import TopNavigation from '../../components/layout/TopNavigation';\nimport AlertDialog from '../../components/ui/AlertDialog';")

# 2. Add state
if 'const [deleteAssetId' not in content:
    content = content.replace("const [isDragging, setIsDragging] = useState(false);", "const [isDragging, setIsDragging] = useState(false);\n    const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);")

# 3. Replace window.confirm
old_delete_n = """                                                if (window.confirm('Delete this asset permanently?')) {
                                                    db.deleteAsset(asset.id).then(() => {
                                                        loadAssets();
                                                    });
                                                }"""
old_delete_rn = old_delete_n.replace('\n', '\r\n')
new_delete = """                                                if (asset.id) { setDeleteAssetId(asset.id); }"""
content = content.replace(old_delete_n, new_delete)
content = content.replace(old_delete_rn, new_delete)

# 4. Add AlertDialog at the end
if 'isOpen={!!deleteAssetId}' not in content:
    alert_dialog = """
            <AlertDialog
                isOpen={!!deleteAssetId}
                title="Delete Asset"
                description="Are you sure you want to delete this asset? This action cannot be undone."
                confirmText="Delete"
                cancelText="Cancel"
                type="danger"
                onConfirm={() => {
                    if (deleteAssetId) {
                        db.deleteAsset(deleteAssetId).then(() => {
                            loadAssets();
                            setDeleteAssetId(null);
                        });
                    }
                }}
                onCancel={() => setDeleteAssetId(null)}
            />"""
    # Replace the exact sequence `<div className="flex-1..."> ... </main></div>` correctly
    content = re.sub(r'(</main>\s*</div>\s*\);\s*};\s*export default AssetLibrary;)', alert_dialog + r'\n\1', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("AssetLibraryPage updated")
