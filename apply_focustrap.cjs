const fs = require('fs');
let code = fs.readFileSync('src/pages/Assets.tsx', 'utf8');

if (!code.includes('useFocusTrap')) {
  code = code.replace("import { AssetsSkeleton } from '../components/SkeletonLoaders'", "import { AssetsSkeleton } from '../components/SkeletonLoaders'\nimport { useFocusTrap } from '../hooks/useFocusTrap'");

  const hookInjection = `  const editModalRef = useFocusTrap(!!editAsset, () => setEditAsset(null));
  const txModalRef = useFocusTrap(!!txAsset, () => setTxAsset(null));
  const manualModalRef = useFocusTrap(!!manualAsset, () => setManualAsset(null));`;

  code = code.replace("const Assets = () => {", "const Assets = () => {\n" + hookInjection);

  code = code.replace(
    /<div className=\"modal-overlay\">/g,
    (match, offset) => {
      const preceding = code.substring(offset - 150, offset);
      if (preceding.includes('editAsset')) {
        return `<div className="modal-overlay" role="dialog" aria-modal="true">`;
      }
      if (preceding.includes('txAsset')) {
        return `<div className="modal-overlay" role="dialog" aria-modal="true">`;
      }
      if (preceding.includes('manualAsset')) {
        return `<div className="modal-overlay" role="dialog" aria-modal="true">`;
      }
      return match;
    }
  );
  
  code = code.replace(
    /<div className=\"modal-content\">/g,
    (match, offset) => {
      const preceding = code.substring(offset - 150, offset);
      if (preceding.includes('editAsset')) {
        return `<div className="modal-content" ref={editModalRef}>`;
      }
      if (preceding.includes('txAsset')) {
        return `<div className="modal-content" ref={txModalRef}>`;
      }
      if (preceding.includes('manualAsset')) {
        return `<div className="modal-content" ref={manualModalRef}>`;
      }
      return match;
    }
  );

  fs.writeFileSync('src/pages/Assets.tsx', code);
}
