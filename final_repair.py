import os

file_path = r'c:\Users\revin\Downloads\Capstone\public\legacy\styles.css'

with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Find the broken keyframes and replace it with the correct full set of styles
broken_start = "@keyframes verifiedPulse {"
# Find the next class after the broken part
broken_end = ".status-badge.pending {"

start_idx = content.find(broken_start)
end_idx = content.find(broken_end)

if start_idx != -1 and end_idx != -1:
    replacement = """@keyframes verifiedPulse {
    0% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.05);
    }
    100% {
        transform: scale(1);
    }
}

.status-badge.verified-pulse {
    animation: verifiedPulse 0.5s ease-out;
}

/* Toast Notifications */
.toast {
    background: rgba(30, 41, 59, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 0.9rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    transform: translateY(20px);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast.show {
    transform: translateY(0);
    opacity: 1;
}

/* Checkout Verification Badges */
.status-badge {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: 1px solid transparent;
}

"""
    new_content = content[:start_idx] + replacement + content[end_idx:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("CSS successfully repaired.")
else:
    print(f"Indices not found: start={start_idx}, end={end_idx}")
