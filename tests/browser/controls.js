export async function openControl(page,id){
  const details=await page.locator('#'+id).evaluate(element=>{const d=element.closest('details');return d?{id:d.id,open:d.open}:null;});
  if(details&&!details.open)await page.locator(`#${details.id} > summary`).click();
}
