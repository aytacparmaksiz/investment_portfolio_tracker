import os
import re

def process_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find inputs without aria-label and add aria-label matching placeholder
    # This regex is careful: looks for <input ... placeholder="XYZ" ... />
    # without an aria-label
    def input_replacer(match):
        full_tag = match.group(0)
        if 'aria-label=' in full_tag:
            return full_tag
        
        # Extract placeholder
        ph_match = re.search(r'placeholder="([^"]+)"', full_tag)
        ph_val = ph_match.group(1) if ph_match else ""
        
        if ph_val:
            # Inject aria-label right after placeholder
            new_tag = re.sub(r'placeholder="([^"]+)"', f'placeholder="{ph_val}" aria-label="{ph_val}"', full_tag)
            return new_tag
            
        return full_tag

    new_content = re.sub(r'<input\b[^>]*>', input_replacer, content)

    # Specific color replacements
    if 'Goals.tsx' in filepath:
        # We replace specific lines that use hardcoded colors for cards and buttons
        new_content = new_content.replace("color: '#10b981'", "color: 'var(--green)'")
        new_content = new_content.replace("background: savingType === 'giris' ? '#10b981' : 'none'", "background: savingType === 'giris' ? 'var(--green)' : 'none'")
        new_content = new_content.replace("border: '1px solid var(--red)'", "border: '1px solid var(--red)'") # This was already var(--red)
        
    if 'Analytics.tsx' in filepath:
        # Text colors
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
print("Fixes applied.")
