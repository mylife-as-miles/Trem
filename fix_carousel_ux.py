with open("src/dashboard/create/components/TemplateCarousel.tsx", "r") as f:
    content = f.read()

# Fix pointer events on the outer div
# We added `pointer-events-none` to all cards in the previous step, which is incorrect.
content = content.replace(
    "className={`flex-none w-72 snap-center transition-all duration-300 relative pointer-events-none",
    "className={`flex-none w-72 snap-center transition-all duration-300 relative"
)

# Fix the memory leak in EditPlanningView
import re
with open("src/dashboard/edit/EditPlanningView.tsx", "r") as f:
    planning_content = f.read()

# Make sure pollInterval can be cleared on unmount.
# We have `pollIntervalRef` added? Let's check.
