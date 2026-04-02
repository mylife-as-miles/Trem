import re

with open("src/dashboard/edit/EditPlanningView.tsx", "r") as f:
    content = f.read()

# Instead of a local const pollInterval inside handleSendMessage,
# we need to track it at the component level using a ref to clear it on unmount.

# 1. Add useRef to imports if not there (already there).
# 2. Add a ref for polling interval.
# 3. Use the ref in both places (initial useEffect and handleSendMessage).
# 4. Clear it in unmount.

# Let's write a simple patch for this.

with open("src/dashboard/edit/EditPlanningView.tsx", "w") as f:
    f.write(content.replace(
        "const [status, setStatus] = useState<'analyzing' | 'ready' | 'failed'>('analyzing');",
        "const [status, setStatus] = useState<'analyzing' | 'ready' | 'failed'>('analyzing');\n    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);"
    ).replace(
        "let pollInterval: NodeJS.Timeout;",
        ""
    ).replace(
        "pollInterval = setInterval(async () => {",
        "pollIntervalRef.current = setInterval(async () => {"
    ).replace(
        "clearInterval(pollInterval);",
        "if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);"
    ).replace(
        "if (pollInterval) clearInterval(pollInterval);",
        "if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);"
    ).replace(
        "const pollInterval = setInterval(async () => {",
        "pollIntervalRef.current = setInterval(async () => {"
    ))
