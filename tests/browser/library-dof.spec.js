import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {waitInitialFrame,waitFrame,setRanges,openControl} from './controls.js';

// Explicitly enabled only for the isolated experimental branch's comparison.
test.describe('isolated mature-library DOF trial',()=>{
  test.skip(process.env.DOF_TRIAL_COMPARE!=='1','Opt-in phase-two comparison; not the default renderer.');

  test('package lens comparison records near, far, thin, ordinary, HDR and axial inputs',async({page},testInfo)=>{
    test.setTimeout(360000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto('/dof-fixture/');await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    const cases=[
      {id:'focused-near',focus:2},
      {id:'defocused-near',focus:8},
      {id:'stopped-near',focus:8,aperture:5.6},
      {id:'thin-wire',kind:'wire',focus:8,focal:70},
      {id:'ordinary-texture',kind:'texture',focus:3,focal:35,aperture:5.6},
      {id:'far-highlight-hdr',kind:'hdr',focus:2},
      {id:'focused-hdr',kind:'hdr',focus:8,nearZ:8,farZ:8},
      {id:'focused-axial-plane',kind:'plane',focus:3},
      {id:'hardware-depth-near',focus:8,axial:false},
      {id:'export-scaled-near',focus:8,width:1024},
      {id:'equal-depth-edge-f14',focus:2,focal:70,nearZ:8,farZ:8},
      {id:'equal-depth-edge-f56',focus:2,focal:70,nearZ:8,farZ:8,aperture:5.6},
      {id:'point-psf-f14',kind:'point',focus:2,focal:70,nearZ:8,farZ:8},
      {id:'point-psf-f56',kind:'point',focus:2,focal:70,nearZ:8,farZ:8,aperture:5.6},
    ];
    const captures=[];
    for(const settings of cases)for(const variant of ['baseline','library']){
      const result=await page.evaluate(({variant,settings})=>window.lensFixture.run(variant,settings),{variant,settings});
      const png=testInfo.outputPath(`${settings.id}-${variant}.png`);
      await writeFile(png,Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
      captures.push(result);await testInfo.attach(`${settings.id}-${variant}`,{path:png,contentType:'image/png'});
      expect(result.completedMs).toHaveLength(5);expect(result.completedMs.every(v=>Number.isFinite(v)&&v>0)).toBe(true);
      expect(result.scanline.every(Number.isFinite)).toBe(true);
    }
    const plane=captures.filter(c=>c.settings.id==='focused-axial-plane');
    for(const result of plane){const red=result.scanline.filter((_,i)=>i%4===0);expect(Math.max(...red)-Math.min(...red)).toBeLessThan(.002);expect(red[0]).toBeCloseTo(.12,2);}
    for(const result of captures.filter(c=>c.settings.id==='focused-hdr'))expect(result.peak).toBeGreaterThan(1);
    const detail=[];
    for(const kind of ['edge','wire','texture']){
      const result=await page.evaluate(kind=>window.lensFixture.compareDetail('library',{kind,focus:8}),kind);detail.push(result);
      expect(result.mean).toBeLessThan(.005);expect(result.max).toBeLessThan(.02);
    }
    const report=testInfo.outputPath('library-comparison.json');await writeFile(report,JSON.stringify({captures,detail,errors},null,2));
    await testInfo.attach('library-comparison',{path:report,contentType:'application/json'});
    await page.evaluate(()=>window.lensFixture.dispose());expect(errors).toEqual([]);
  });

  test('opt-in real photograph retains optics, motion, flash, magnifier and export',async({page},testInfo)=>{
    test.setTimeout(360000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.addInitScript(()=>{
      window.lensAudit={coc:0,display:0,double:0,axial:0,detailWrites:0};
      for(const name of ['drawArrays','drawElements']){
        const original=WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name]=function(...args){
          const result=original.apply(this,args),program=this.getParameter(this.CURRENT_PROGRAM);
          const read=name=>{const p=this.getUniformLocation(program,name);return p?this.getUniform(program,p):null;};
          if(read('opticalFocus')!==null){window.lensAudit.coc++;if(read('axialDepth'))window.lensAudit.axial++;}
          if(read('skipLens')!==null&&!read('meteringPass')&&!read('lensOnly')){window.lensAudit.display++;if(!read('skipLens'))window.lensAudit.double++;}
          return result;
        };
      }
      const enable=WebGL2RenderingContext.prototype.enable;
      WebGL2RenderingContext.prototype.enable=function(cap){if(window.fullFrameIntegration&&cap===this.SCISSOR_TEST){this.disable(cap);return;}return enable.call(this,cap);};
      const put=CanvasRenderingContext2D.prototype.putImageData;
      CanvasRenderingContext2D.prototype.putImageData=function(...args){const result=put.apply(this,args);if(this.canvas.id==='magnifier')window.lensAudit.detailWrites++;return result;};
    });
    await page.setViewportSize({width:900,height:800});
    const snapshots=[];
    for(const variant of ['baseline','library']){
      await page.goto(variant==='library'?'/?dof=library':'/');await waitInitialFrame(page);
      const image=page.locator('#image');
      if(variant==='library')await expect(image).toHaveAttribute('data-dof','postprocessing-6.39.5');
      else await expect(image).not.toHaveAttribute('data-dof');
      await openControl(page,'autoISO');await page.locator('#autoISO').uncheck();await waitFrame(page);
      for(const [aperture,iso]of [[0,2],[4,6]]){
        await setRanges(page,{aperture,iso,shutter:6,focal:50,focus:3});await page.mouse.move(0,0);
        await expect(image).toHaveAttribute('data-pending-layers','0');await waitFrame(page);
        await image.screenshot({path:testInfo.outputPath(`${variant}-barbershop-aperture-index-${aperture}.png`)});
        snapshots.push({variant,aperture,iso,...await image.evaluate(c=>({width:c.width,height:c.height,ev:c.dataset.ev,focus:c.dataset.focus,meter:c.dataset.meterEv}))});
      }
    }
    expect(snapshots[0].ev).toBe(snapshots[2].ev);expect(snapshots[1].ev).toBe(snapshots[3].ev);
    await openControl(page,'pause');await page.locator('#pause').check();await page.locator('#motion').check();await waitFrame(page);
    await setRanges(page,{focal:24,aperture:3,iso:2,shutter:8,flash:1,wb:6500});
    await expect(page.locator('#image')).toHaveAttribute('data-pending-layers','0');await waitFrame(page);await page.mouse.move(0,0);
    const bounded=await page.locator('#image').screenshot();await writeFile(testInfo.outputPath('library-motion-flash-bounded.png'),bounded);
    await expect.poll(async()=>Number(await page.locator('#image').getAttribute('data-temporal-samples'))).toBeGreaterThan(1);
    await page.evaluate(()=>{window.fullFrameIntegration=true;});await setRanges(page,{wb:6500});
    const full=await page.locator('#image').screenshot();await writeFile(testInfo.outputPath('library-motion-flash-full.png'),full);
    const a=await sharp(bounded).removeAlpha().raw().toBuffer(),b=await sharp(full).removeAlpha().raw().toBuffer();
    const temporalError=a.reduce((n,v,i)=>n+Math.abs(v-b[i]),0)/a.length;expect(temporalError).toBeLessThan(1);
    await page.evaluate(()=>{window.fullFrameIntegration=false;});await setRanges(page,{wb:6500});
    await openControl(page,'magnifier-toggle');await page.locator('#magnifier-toggle').check();
    const hover=async()=>{await page.locator('#image').scrollIntoViewIfNeeded();await waitFrame(page);const before=await page.evaluate(()=>window.lensAudit.detailWrites),box=await page.locator('#image').boundingBox();await page.mouse.move(box.x+box.width*.52,box.y+box.height*.54);await expect.poll(()=>page.evaluate(()=>window.lensAudit.detailWrites)).toBeGreaterThan(before);};
    await hover();await expect(page.locator('#magnifier')).toBeVisible();await expect(page.locator('#image')).toHaveAttribute('data-pending-layers','0');await waitFrame(page);
    await page.mouse.move(0,0);const before=await page.locator('#image').evaluate(c=>({pixels:c.toDataURL(),ev:c.dataset.ev,focus:c.dataset.focus,meter:c.dataset.meterEv,temporal:c.dataset.temporalSamples}));
    const oldAudit=await page.evaluate(()=>({...window.lensAudit}));await hover();
    expect(await page.locator('#image').evaluate(c=>({pixels:c.toDataURL(),ev:c.dataset.ev,focus:c.dataset.focus,meter:c.dataset.meterEv,temporal:c.dataset.temporalSamples}))).toEqual(before);
    const audit=await page.evaluate(()=>({...window.lensAudit}));expect(audit.coc).toBeGreaterThan(oldAudit.coc);expect(audit.axial).toBeGreaterThan(0);expect(audit.double).toBe(0);
    await expect(page.locator('#magnifier')).toHaveAttribute('data-source','detail-render');
    await page.locator('#viewfinder').screenshot({path:testInfo.outputPath('library-paused-magnifier.png')});
    const downloadEvent=page.waitForEvent('download');await page.locator('#capture').click();const download=await downloadEvent;
    expect(await download.failure()).toBeNull();await download.saveAs(testInfo.outputPath('library-export.png'));
    await page.locator('#scene').selectOption('classroom');await waitInitialFrame(page);
    await expect(page.locator('#image')).toHaveAttribute('data-dof','postprocessing-6.39.5');
    const report=testInfo.outputPath('real-photograph-contracts.json');await writeFile(report,JSON.stringify({snapshots,temporalError,audit,errors},null,2));
    await testInfo.attach('real-photograph-contracts',{path:report,contentType:'application/json'});expect(errors).toEqual([]);
  });
});
