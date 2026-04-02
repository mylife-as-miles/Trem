with open("src/dashboard/edit/EditPlanningView.tsx", "r") as f:
    content = f.read()

content = content.replace("const pollIntervalRef.current =", "pollIntervalRef.current =")

with open("src/dashboard/edit/EditPlanningView.tsx", "w") as f:
    f.write(content)
