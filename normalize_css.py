import os

file_path = r'c:\Users\revin\Downloads\Capstone\public\legacy\styles.css'

with open(file_path, 'rb') as f:
    content = f.read()

# Remove all NUL bytes
content = content.replace(b'\x00', b'')

# Try to decode as UTF-8, then Latin-1
try:
    text = content.decode('utf-8')
except UnicodeDecodeError:
    text = content.decode('latin-1')

# Fix double newlines (common after NUL removal from CRLF)
text = text.replace('\r\n\r\n', '\r\n').replace('\n\n', '\n')

with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)

print("File normalized and compact again.")
