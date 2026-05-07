# AI Multi-Emergency Resource Balancer
# Simple Python Simulation Project

import heapq

# -----------------------------
# Emergency Data
# -----------------------------
emergencies = [
    {"id": 1, "type": "Fire", "severity": 9, "location": "Area A"},
    {"id": 2, "type": "Accident", "severity": 7, "location": "Area B"},
    {"id": 3, "type": "Crime", "severity": 5, "location": "Area C"},
]

# -----------------------------
# Available Resources
# -----------------------------
resources = {
    "ambulance": 2,
    "fire_truck": 1,
    "police": 2
}

# -----------------------------
# Priority Queue
# Higher severity = Higher priority
# -----------------------------
priority_queue = []

for emergency in emergencies:
    heapq.heappush(priority_queue, (-emergency["severity"], emergency))

# -----------------------------
# Resource Allocation Function
# -----------------------------
def allocate_resources(emergency):
    
    allocated = []

    if emergency["type"] == "Fire":
        if resources["fire_truck"] > 0:
            resources["fire_truck"] -= 1
            allocated.append("Fire Truck")

        if resources["ambulance"] > 0:
            resources["ambulance"] -= 1
            allocated.append("Ambulance")

    elif emergency["type"] == "Accident":
        if resources["ambulance"] > 0:
            resources["ambulance"] -= 1
            allocated.append("Ambulance")

        if resources["police"] > 0:
            resources["police"] -= 1
            allocated.append("Police")

    elif emergency["type"] == "Crime":
        if resources["police"] > 0:
            resources["police"] -= 1
            allocated.append("Police")

    return allocated

# -----------------------------
# Process Emergencies
# -----------------------------
print("\n----- AI Emergency Resource Allocation -----\n")

while priority_queue:
    _, emergency = heapq.heappop(priority_queue)

    allocated_resources = allocate_resources(emergency)

    print(f"Emergency ID      : {emergency['id']}")
    print(f"Type              : {emergency['type']}")
    print(f"Severity          : {emergency['severity']}")
    print(f"Location          : {emergency['location']}")

    if allocated_resources:
        print(f"Allocated         : {', '.join(allocated_resources)}")
    else:
        print("Allocated         : No resources available")

    print("--------------------------------------------")

# -----------------------------
# Remaining Resources
# -----------------------------
print("\nRemaining Resources:")
for resource, count in resources.items():
    print(f"{resource} : {count}")
