const fs=require('node:fs'),path=require('node:path')
const files=['visual-workbench','visual-simple','visual-remix','visual-planner','visual-suite','visual-generate','visual-assets','visual-profile','api-settings-page','generate-queue-panel','generation-actions','generation-settings','product-images-upload','prompt-editor','load-suite-panel','save-suite-button','task-image-gallery','image-size-hint','asset-picker','custom-ratio-input']
for(const name of files){const file=`src/components/${name}.tsx`;const source=fs.readFileSync(file,'utf8'),backup=path.join('backups/ux-u2-u7-20261017',file+'.bak');fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.writeFileSync(backup,source)
 let next=source.replaceAll('text-[10px]','text-xs').replaceAll('text-[11px]','text-xs').replaceAll('leading-3','leading-5').replaceAll('leading-4','leading-5')
 next=next.replace(/max-w-(?:6xl|7xl|\[1600px\])/g,'workspace-shell').replace('<div className="mx-auto','<div data-workspace className="mx-auto')
 next=next.replace(/grid (?:grid-cols-1 )?(?:items-stretch )?gap-[34] lg:grid-cols-2 2xl:grid-cols-3/g,'entry-grid')
 if(next!==source)fs.writeFileSync(file,next)
}
