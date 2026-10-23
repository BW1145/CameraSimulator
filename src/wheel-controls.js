// Native ranges remain the single source of truth: wheel changes dispatch the
// same input events as dragging/keyboard, never mutate camera state directly.
export class WheelSteps {
  constructor(){this.reset();}
  reset(){this.target=null;this.total=0;this.last=0;this.direction=0;}
  consume(event,target,now){
    if(event.ctrlKey||event.metaKey||event.shiftKey||!Number.isFinite(event.deltaY)||!event.deltaY||Math.abs(event.deltaX)>=Math.abs(event.deltaY)){this.reset();return null;}
    const direction=Math.sign(event.deltaY);
    if(target!==this.target||now-this.last>220||direction!==this.direction)this.total=0;
    this.target=target;this.last=now;this.direction=direction;
    // A conventional line-mode wheel notch is ~3 lines; pixel trackpads
    // accumulate instead of turning every tiny event into a full stop.
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?120:1);
    this.total+=Math.max(-40,Math.min(40,pixels));
    const steps=Math.trunc(this.total/40);
    this.total-=steps*40;
    return steps?-Math.sign(steps):0;
  }
}
export function steppedValue(input,steps){
  const min=Number(input.min||0),max=Number(input.max||100),step=Number(input.step||1),value=Number(input.value);
  if(!Number.isFinite(step)||step<=0||!Number.isFinite(value))return value;
  // Respect the input's min-based step grid, including fractional values.
  const next=min+(Math.round((value-min)/step)+steps)*step;
  return Number(Math.min(max,Math.max(min,next)).toFixed(8));
}
export function installWheelControls({root,image,focal,enabled=()=>true}){
  const wheel=new WheelSteps();
  root.addEventListener('wheel',event=>{
    if(!event.cancelable||event.defaultPrevented)return;
    const target=event.target;
    let input=target===image?focal:target.closest?.('input[type="range"],input[type="number"]');
    if(!input){const label=target.closest?.('label');input=label?.querySelector('input[type="range"],input[type="number"]');}
    if(!input||input.disabled||!enabled()||input.closest('[hidden]')){wheel.reset();return;}
    const steps=wheel.consume(event,input,performance.now());
    if(steps===null)return;
    // A numeric parameter owns vertical wheel even at its limit, so the page
    // cannot unexpectedly jump away while fine-tuning it.
    event.preventDefault();
    if(!steps)return;
    const value=steppedValue(input,steps);
    if(value===Number(input.value))return;
    input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));
  },{passive:false});
}
