// Browser regressions exercise the actual compact-workspace hand controls.
// Keeping this helper in tests avoids bypassing the real UI event handlers.
async function chooseInHandsMenu(page,selector,value){
 const panel=page.locator('#handsMenuPanel');
 const toggle=page.locator('#handsMenuButton');
 if(!(await panel.isVisible()))await toggle.click();
 await page.locator(selector).selectOption(value);
 if(await panel.isVisible())await toggle.click();
}
export const selectCompactFingerMode=(page,mode)=>
 chooseInHandsMenu(page,'#fingerGuideMode',mode);
export const selectCompactLookahead=(page,milliseconds)=>
 chooseInHandsMenu(page,'#fingerGuideLookahead',milliseconds);
