import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {openControl,waitFrame} from './controls.js';

test('slow first load tolerates camera controls and dragging before a pack exists',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let release;
  await page.route('**/barbershop-plates/manifest.json',async route=>{await new Promise(resolve=>{release=resolve;});await route.continue();});
  await page.goto('/');await expect.poll(()=>Boolean(release)).toBe(true);
  await page.locator('#wb').fill('6500');
  await openControl(page,'focal');await page.locator('#focal').fill('60');
  const canvas=page.locator('#image'),box=await canvas.boundingBox();await page.mouse.move(box.x+50,box.y+40);await page.mouse.down();await page.mouse.move(box.x+150,box.y+70);await page.mouse.up();
  release();await expect(canvas).toHaveAttribute('data-ready','true');expect(errors).toEqual([]);
});

test('AF-C preserves an actual fan base hit instead of jumping to the rotor center',async({page})=>{
  await page.goto('/');const canvas=page.locator('#image');await expect(canvas).toHaveAttribute('data-ready','true');
  await openControl(page,'focal');await page.locator('#focal').fill('50');await page.locator('#crop').selectOption('3:2');
  await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-156.25,box.y+box.height*.4+18.75,{steps:8});await page.mouse.up();
  await openControl(page,'af');await page.locator('#af').selectOption('AF-C');
  const pack=JSON.parse(await readFile('public/scenes/barbershop-plates/manifest.json','utf8'));
  const camera=new T.PerspectiveCamera(2*Math.atan((36/pack.camera.aspect)/(2*50))*180/Math.PI,1.5,1.1,100);
  const matrix=new T.Matrix4().fromArray(pack.views[0].cameraMatrix);camera.position.setFromMatrixPosition(matrix);camera.quaternion.setFromRotationMatrix(matrix).multiply(new T.Quaternion().setFromEuler(new T.Euler(-3*Math.PI/180,25*Math.PI/180,0,'YXZ')));camera.updateMatrixWorld(true);
  const point=new T.Vector3(3.8,.845,-6.95).project(camera),x=(point.x*.5+.5)*box.width,y=(.5-point.y*.5)*box.height;
  await canvas.click({position:{x,y}});await page.mouse.move(0,0);await waitFrame(page);
  const mark=await page.locator('#focus-mark').evaluate(e=>({x:parseFloat(e.style.left)/100,y:parseFloat(e.style.top)/100}));
  expect(Math.abs(mark.x-x/box.width)).toBeLessThan(.012);expect(Math.abs(mark.y-y/box.height)).toBeLessThan(.012);
});
