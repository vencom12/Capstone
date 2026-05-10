import os

file_path = r'c:\Users\revin\Downloads\Capstone\public\legacy\styles.css'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the location of verifiedPulse
new_lines = []
found = False
for i, line in enumerate(lines):
    new_lines.append(line)
    if '100% {' in line and i < len(lines)-1 and '/* Checkout Verification Badges */' in lines[i+1]:
        # Insert the missing parts
        new_lines.append('        transform: scale(1);\n')
        new_lines.append('    }\n')
        new_lines.append('}\n\n')
        new_lines.append('.status-badge.verified {\n')
        new_lines.append('    animation: verifiedPulse 0.5s ease-out;\n')
        new_lines.append('}\n\n')
        new_lines.append('/* Toast Notifications */\n')
        new_lines.append('.toast {\n')
        new_lines.append('    background: rgba(30, 41, 59, 0.8);\n')
        new_lines.append('    backdrop-filter: blur(12px);\n')
        new_lines.append('    border: 1px solid rgba(255, 255, 255, 0.1);\n')
        new_lines.append('    color: white;\n')
        new_lines.append('    padding: 12px 24px;\n')
        new_lines.append('    border-radius: 12px;\n')
        new_lines.append('    font-size: 0.9rem;\n')
        new_lines.append('    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);\n')
        new_lines.append('    transform: translateY(20px);\n')
        new_lines.append('    opacity: 0;\n')
        new_lines.append('    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n')
        new_lines.append('}\n\n')
        new_lines.append('.toast.show {\n')
        new_lines.append('    transform: translateY(0);\n')
        new_lines.append('    opacity: 1;\n')
        new_lines.append('}\n\n')
        found = True

if found:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("File repaired.")
else:
    print("Anchor not found.")
