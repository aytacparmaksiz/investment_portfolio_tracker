import os
import re

def process_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find inputs without aria-label
    # We use a while loop to find all <input ... > tags (they might span multiple lines)
    
    # regex for <input ... >
    # re.DOTALL is not needed if we use [^>]*
    new_content = content
    offset = 0
    while True:
        match = re.search(r'<input\b[^>]*>', new_content[offset:])
        if not match:
            break
        
        full_tag = match.group(0)
        start_idx = offset + match.start()
        end_idx = offset + match.end()
        
        offset = end_idx
        
        if 'aria-label=' in full_tag:
            continue
            
        ph_match = re.search(r'placeholder=(?:"([^"]+)"|\{([^}]+)\})', full_tag)
        if ph_match:
            ph_val = ph_match.group(1) if ph_match.group(1) else ph_match.group(2)
            if ph_val:
                # Add aria-label right before the closing of the tag
                if full_tag.endswith('/>'):
                    new_tag = full_tag[:-2] + f' aria-label="{ph_val}" />'
                else:
                    new_tag = full_tag[:-1] + f' aria-label="{ph_val}">'
                
                new_content = new_content[:start_idx] + new_tag + new_content[end_idx:]
                offset = start_idx + len(new_tag)
        else:
            # no placeholder, we can add a default aria-label if we want
            pass

    # Colors
    if 'Goals.tsx' in filepath:
        new_content = new_content.replace("color: '#10b981'", "color: 'var(--green)'")
        new_content = new_content.replace("background: savingType === 'giris' ? '#10b981' : 'none'", "background: savingType === 'giris' ? 'var(--green)' : 'none'")
        new_content = new_content.replace("border: '1px solid var(--red)'", "border: '1px solid var(--red)'")
        
    if 'Analytics.tsx' in filepath:
        new_content = new_content.replace("color: '#1e1b4b'", "color: 'var(--text-primary)'")

    if 'ErrorBoundary.tsx' in filepath:
        new_content = new_content.replace("background: '#6366f1'", "background: 'var(--accent)'")
        new_content = new_content.replace("color: '#f87171'", "color: 'var(--red)'")
        new_content = new_content.replace("rgba(239, 68, 68, 0.1)", "var(--red-dim)")
        new_content = new_content.replace("rgba(239, 68, 68, 0.2)", "var(--red)")
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

files = [
    'src/pages/Dashboard.tsx',
    'src/pages/Assets.tsx',
    'src/pages/Analytics.tsx',
    'src/pages/Goals.tsx',
    'src/pages/Login.tsx',
    'src/components/BottomNav.tsx',
    'src/components/ErrorBoundary.tsx'
]

for f in files:
    process_file(f)
print("Fixes applied v2.")
