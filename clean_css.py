import os

file_path = r'c:\Users\revin\Downloads\Capstone\public\legacy\styles.css'

with open(file_path, 'rb') as f:
    content = f.read()

# Remove NUL bytes and try to decode as UTF-8
clean_content = content.replace(b'\x00', b'')

# The spaced out text is likely "T o a s t" -> "Toast"
# If we remove NUL bytes, "T\x00o\x00a\x00s\x00t" becomes "Toast"
# But if it's already "T o a s t" (actual spaces), we might need to handle that.
# Looking at the view output, they look like actual spaces in the text stream now.

# Let's just decode and write back.
try:
    decoded = clean_content.decode('utf-8')
except UnicodeDecodeError:
    decoded = clean_content.decode('latin-1')

# Now, find the specific corrupted block and fix it via string replacement if it exists
corrupted_start = " / *   T o a s t   N o t i f i c a t i o n s   * / "
if corrupted_start in decoded:
    # This is a very specific fix for the "spaced out" block
    # We'll replace the whole known corrupted section
    import re
    # Match the whole block from the comment to the end of the toast.show class
    pattern = re.compile(r' / \*   T o a s t   N o t i f i c a t i o n s   \* / .*?\. t o a s t \. s h o w    \{.*?\n\s+\n\}', re.DOTALL)
    
    clean_block = """/* Toast Notifications */
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
}"""
    decoded = pattern.sub(clean_block, decoded)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(decoded)

print("File cleaned and repaired.")
