import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('travel closeup copies the map and moves between the selected cell centers', () => {
  const source=fs.readFileSync(new URL('../public/js/exploration/exploration.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function playRouteTravelCloseup('),source.indexOf('\nfunction routePresentationKey('));
  const makeElement=()=>({style:{setProperty(k,v){this[k]=v;}},classList:{add(){}},children:[],append(...items){this.children.push(...items);},setAttribute(){},remove(){}});
  const from={getBoundingClientRect:()=>({left:110,top:100,width:68,height:78})};
  const to={dataset:{hexId:'chosen'},getBoundingClientRect:()=>({left:178,top:159,width:68,height:78})};
  let copied;
  const board={getBoundingClientRect:()=>({left:100,top:80,width:500}),querySelector:()=>from,querySelectorAll:()=>[to],cloneNode(){
    copied=makeElement();copied.querySelectorAll=()=>[];copied.querySelector=()=>null;copied.insertAdjacentHTML=(_pos,html)=>{copied.arrow=html;};return copied;
  }};
  const body=makeElement(),target={id:'chosen',col:1,row:4};
  const context=vm.createContext({window:{innerWidth:1000,matchMedia:()=>({matches:false})},elements:{hexMapContainer:{querySelector:()=>board}},
    roomState:{hexMap:[[target]]},document:{querySelector:()=>null,createElement:makeElement,body},
    buildHexRouteArrowHtml:(_col,_row,node)=>'arrow:'+node.id,setTimeout:()=>{}});
  vm.runInContext(code+'\nplayRouteTravelCloseup',context)({hexId:'chosen',fromHex:{col:0,row:3},routeName:'道路'});
  assert.equal(body.children[0].children[0],copied);
  assert.equal(copied.arrow,'arrow:chosen');
  assert.equal(copied.children[0].style['--travel-dx'],'68px');
  assert.equal(copied.children[0].style['--travel-dy'],'59px');
  assert.equal(copied.style.width,'500px');
});
