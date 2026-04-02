import os

for root, _, files in os.walk("worker/src"):
    for file in files:
        if file.endswith(".ts") and not file.endswith(".d.ts"):
            path = os.path.join(root, file)
            with open(path, "r") as f:
                content = f.read()
            # remove inline type Env
            import re
            content = re.sub(r'type Env = \{[^}]+\};\n', '', content)

            with open(path, "w") as f:
                f.write(content)
