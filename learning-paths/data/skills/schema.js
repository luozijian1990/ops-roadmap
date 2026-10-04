/* Atomic skills: stable ID | title | learning objective | observable exercise | depth? | tier?
   A module has any number of children. Missing definitions are errors, never auto-filled.
   Tier is 入门 / 进阶 / 选修, separate from proficiency (了解 / 会用 / 会排障). */
window.OPS_LEAVES = {};
function defineLeaves(moduleId, source) {
  if (window.OPS_LEAVES[moduleId]) throw new Error('Duplicate module: '+moduleId);
  window.OPS_LEAVES[moduleId] = source.trim().split('\n').map(line => {
    const [slug,title,objective,exercise,level,tier] = line.split('|');
    if (![slug,title,objective,exercise].every(Boolean)) throw new Error('Incomplete skill: '+line);
    return {id:moduleId+'.'+slug,moduleId,title,objective,exercise,level:level||'会用',tier:tier||null};
  });
}
