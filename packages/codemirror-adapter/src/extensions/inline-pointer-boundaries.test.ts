// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {EditorState, EditorSelection, type Extension} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {undo, redo} from '@codemirror/commands';
import {setHeadingPresentation, setHeadingPresentationEffect} from '../heading-marker-presentation';
import {createFishMarkMarkdownExtensions} from './markdown';
import {createDocumentStructureCache} from '@fishmark/markdown-engine';
import {createActiveBlockState, createEditorDerivedSnapshotFromCache} from '@fishmark/editor-model';
import {resolvePointerSelectionAnchor} from '../interactions/registry';
const prefix='Control\n\n';
const styles=[
  {inline:'**AAA**',className:'cm-inactive-inline-strong',open:'**',close:'**'},
  {inline:'*AAA*',className:'cm-inactive-inline-emphasis',open:'*',close:'*'},
  {inline:'~~AAA~~',className:'cm-inactive-inline-strikethrough',open:'~~',close:'~~'},
  {inline:'`AAA`',className:'cm-inactive-inline-code',open:'`',close:'`'},
  {inline:'[AAA](url)',className:'cm-inactive-inline-link',open:'[',close:'](url)'}
];
function harness(inline:string, options: {readOnly?:boolean; source?:boolean; extra?:Extension} = {}){
  const host=document.body.appendChild(document.createElement('div'));
  const view=new EditorView({parent:host,state:EditorState.create({doc:prefix+inline,extensions:[
    EditorState.readOnly.of(options.readOnly ?? false),
    // Match the real code-editor host's canonical read-only transaction guard.
    EditorState.transactionFilter.of(tr=>tr.docChanged && tr.startState.readOnly ? [] : tr),
    options.extra ?? [],
    createFishMarkMarkdownExtensions({onContentChange(){},viewMode:options.source?'source':'wysiwym'})
  ]})});
  view.focus();view.dispatch({selection:{anchor:1},userEvent:'select.pointer'});
  return{view,host,markers:()=>Array.from(host.querySelectorAll('.cm-active-inline-marker')).map(e=>e.textContent),destroy(){view.destroy();host.remove()}};
}
describe('user-specified inline revealed source boundaries (DOM/source mapping, not pixel hit-testing)',()=>{
  for(const style of styles)for(const [edge,bodyOffset] of [['left',0],['inside',1],['right',3]] as const){
    it(`${style.inline} rendered ${edge}: complete markers and exact outside/content offset`,()=>{
      const h=harness(style.inline);
      try{
        expect(h.markers()).toEqual([]);
        const span=h.host.querySelector('.'+style.className)!;
        const text=span.firstChild!;
        expect(text.textContent).toBe('AAA');
        const incoming=h.view.posAtDOM(text,bodyOffset);
        const expected=prefix.length+(edge==='left'?0:edge==='right'?style.inline.length:style.open.length+1);
        h.view.dispatch({selection:{anchor:incoming},userEvent:'select.pointer'});
        expect.soft(h.view.state.selection.main.head).toBe(expected);
        expect.soft(h.view.state.selection.main.anchor).toBe(expected);
        expect.soft(h.markers()).toEqual([style.open,style.close]);
        expect(h.view.state.doc.toString()).toBe(prefix+style.inline);
      }finally{h.destroy()}
    });
  }
  for(const [label,offset] of [['|**AAA**',0],['**A|AA**',3],['**AAA**|',7]] as const){
    it(`explicit source target ${label} retains offset and reveals both markers`,()=>{
      const h=harness('**AAA**');
      try{
        h.view.dispatch({selection:{anchor:prefix.length+offset},userEvent:'select.pointer'});
        expect(h.view.state.selection.main.head).toBe(prefix.length+offset);
        expect(h.markers()).toEqual(['**','**']);
      }finally{h.destroy()}
    });
  }
  it.each(styles)('leaving $inline hides both markers',style=>{
    const h=harness(style.inline);
    try{
      h.view.dispatch({selection:{anchor:prefix.length+style.open.length+1},userEvent:'select.pointer'});
      expect(h.markers()).toEqual([style.open,style.close]);
      h.view.dispatch({selection:{anchor:1},userEvent:'select.pointer'});
      expect(h.markers()).toEqual([]);
    }finally{h.destroy()}
  });
});

const click = (view:EditorView, offset:number) => view.dispatch({selection:{anchor:prefix.length+offset},userEvent:'select.pointer'});
const key = (view:EditorView, value:string, shiftKey=false) => view.contentDOM.dispatchEvent(
  new KeyboardEvent('keydown',{key:value,shiftKey,bubbles:true,cancelable:true}));

describe('revealed inline source editing and hidden entry ownership',()=>{
  it('routes a native nested-link closing edge through the DOM caret before geometry scanning',()=>{
    const errors:unknown[]=[],order:string[]=[];
    const inline='[**AAA**](url)',h=harness(inline,{extra:EditorView.exceptionSink.of(error=>errors.push(error))});
    const previous=Object.getOwnPropertyDescriptor(document,'caretPositionFromPoint');
    const coords=vi.spyOn(h.view,'posAtCoords').mockImplementation(()=>{throw new RangeError('Geometry scan must not own this hidden edge')});
    const originalFocus=h.view.focus.bind(h.view),originalDispatch=h.view.dispatch.bind(h.view);
    const focus=vi.spyOn(h.view,'focus').mockImplementation(()=>{order.push('focus');originalFocus()});
    const dispatch=vi.spyOn(h.view,'dispatch').mockImplementation((...args:Parameters<EditorView['dispatch']>)=>{
      if(args.some(arg=>'userEvent' in arg && arg.userEvent==='select.pointer'))order.push('select.pointer');
      originalDispatch(...args);
    });
    try{
      h.view.contentDOM.blur();
      const text=h.host.querySelector('.cm-inactive-inline-strong')!.firstChild!;
      const line=text.parentElement!.closest('.cm-line')!;
      Object.defineProperty(document,'caretPositionFromPoint',{configurable:true,
        value:()=>({offsetNode:text,offset:3})});
      const incoming=h.view.posAtDOM(text,3);
      expect(incoming).toBe(prefix.length+6);
      const snapshot=createEditorDerivedSnapshotFromCache(createDocumentStructureCache(prefix+inline));
      const active=createActiveBlockState(snapshot,h.view.state.selection.main);
      const event=new MouseEvent('mousedown',{button:0,detail:1,clientX:147,clientY:93,bubbles:true,cancelable:true});
      Object.defineProperty(event,'target',{value:line});
      expect(resolvePointerSelectionAnchor(h.view,active,event)).toBe(incoming);
      line.dispatchEvent(event);
      expect(order.indexOf('focus')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('focus')).toBeLessThan(order.indexOf('select.pointer'));
      expect(errors).toEqual([]);
      expect(event.defaultPrevented).toBe(true);
      expect(h.view.state.selection.main.head).toBe(prefix.length+inline.length);
      expect(h.markers()).toEqual(['[','](url)']);
      expect(h.view.state.doc.toString()).toBe(prefix+inline);
      expect(coords).not.toHaveBeenCalled();
      coords.mockReturnValue(prefix.length+4);
      document.dispatchEvent(new MouseEvent('mousemove',{clientX:180,clientY:93,bubbles:true,cancelable:true}));
      expect(h.view.state.selection.main.anchor).toBe(prefix.length+inline.length);
      expect(h.view.state.selection.main.head).toBe(prefix.length+4);
      document.dispatchEvent(new MouseEvent('mouseup',{button:0,clientX:180,clientY:93,bubbles:true}));
    }finally{
      coords.mockRestore();
      focus.mockRestore();dispatch.mockRestore();
      if(previous)Object.defineProperty(document,'caretPositionFromPoint',previous);
      else Reflect.deleteProperty(document,'caretPositionFromPoint');
      h.destroy();
    }
  });
  it.each([
    {label:'Shift',event:{shiftKey:true}}, {label:'Alt',event:{altKey:true}},
    {label:'Control',event:{ctrlKey:true}}, {label:'Meta',event:{metaKey:true}},
    {label:'right button',event:{button:2}}, {label:'double click',event:{detail:2}},
    {label:'drag motion',event:{},type:'mousemove'}, {label:'interior content',event:{},offset:1},
    {label:'revealed source',event:{},revealed:true}, {label:'missing DOM caret',event:{},missing:true},
    {label:'caret in another line',event:{},outside:true}
  ])('keeps $label outside the hidden-edge pointer resolver',options=>{
    const inline='[**AAA**](url)',h=harness(inline);
    const previous=Object.getOwnPropertyDescriptor(document,'caretPositionFromPoint');
    const previousRange=Object.getOwnPropertyDescriptor(document,'caretRangeFromPoint');
    try{
      if(options.revealed)click(h.view,4);
      const text=h.host.querySelector('.cm-inactive-inline-strong')!.firstChild!;
      const line=text.parentElement!.closest('.cm-line')!;
      const node=options.outside?h.view.contentDOM.querySelector('.cm-line')!.firstChild!:text;
      Object.defineProperty(document,'caretPositionFromPoint',{configurable:true,
        value:()=>options.missing?null:{offsetNode:node,offset:options.outside?0:options.offset??3}});
      Object.defineProperty(document,'caretRangeFromPoint',{configurable:true,value:undefined});
      const snapshot=createEditorDerivedSnapshotFromCache(createDocumentStructureCache(prefix+inline));
      const active=createActiveBlockState(snapshot,h.view.state.selection.main);
      const event=new MouseEvent(options.type??'mousedown',{button:0,detail:1,clientX:147,clientY:93,...options.event});
      Object.defineProperty(event,'target',{value:line});
      expect(resolvePointerSelectionAnchor(h.view,active,event)).toBeNull();
    }finally{
      if(previous)Object.defineProperty(document,'caretPositionFromPoint',previous);
      else Reflect.deleteProperty(document,'caretPositionFromPoint');
      if(previousRange)Object.defineProperty(document,'caretRangeFromPoint',previousRange);
      else Reflect.deleteProperty(document,'caretRangeFromPoint');
      h.destroy();
    }
  });
  it.each(['## ','- ','> ','> - '])('maps supported inline within %s without revealing its block prefix',blockPrefix=>{
    for(const [bodyOffset,sourceOffset] of [[2,0],[5,7]]){
      const h=harness(blockPrefix+'**AAA**');
      try{
        click(h.view,blockPrefix.length+bodyOffset!);
        expect(h.view.state.selection.main.head).toBe(prefix.length+blockPrefix.length+sourceOffset!);
        expect(h.markers()).toEqual(['**','**']);
        expect(h.host.querySelector('.cm-active-heading-marker')).toBeNull();
        expect(h.host.querySelector('.cm-active-list-marker')).toBeNull();
        expect(h.view.state.doc.toString()).toBe(prefix+blockPrefix+'**AAA**');
      }finally{h.destroy()}
    }
  });
  it('keeps pointer intent through the list DOM caret resolver and drag anchor',()=>{
    const h=harness('- **AAA**');
    const previous=Object.getOwnPropertyDescriptor(document,'caretPositionFromPoint');
    const coords=vi.spyOn(h.view,'posAtCoords').mockReturnValue(prefix.length+5);
    try{
      const span=h.host.querySelector('.cm-inactive-inline-strong')!;
      Object.defineProperty(document,'caretPositionFromPoint',{configurable:true,
        value:()=>({offsetNode:span.firstChild!,offset:3})});
      const event=new MouseEvent('mousedown',{button:0,detail:1,clientX:10,clientY:10,bubbles:true,cancelable:true});
      span.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(h.view.state.selection.main.head).toBe(prefix.length+9);
      expect(h.markers()).toEqual(['**','**']);
      document.dispatchEvent(new MouseEvent('mousemove',{clientX:40,clientY:10,bubbles:true,cancelable:true}));
      expect(h.view.state.selection.main.anchor).toBe(prefix.length+9);
      expect(h.view.state.selection.main.head).toBe(prefix.length+5);
      document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));
      expect(h.view.state.selection.main.anchor).toBe(prefix.length+9);
      expect(h.view.state.selection.main.head).toBe(prefix.length+5);
    }finally{
      coords.mockRestore();
      if(previous)Object.defineProperty(document,'caretPositionFromPoint',previous);
      else Reflect.deleteProperty(document,'caretPositionFromPoint');
      h.destroy();
    }
  });
  for(const style of styles){
    it(`${style.inline} preserves every revealed source pointer offset`,()=>{
      const h=harness(style.inline);
      try{
        click(h.view,style.open.length+1);
        for(let offset=0;offset<=style.inline.length;offset++){
          click(h.view,offset);
          expect(h.view.state.selection.main.head).toBe(prefix.length+offset);
          expect(h.markers()).toEqual([style.open,style.close]);
        }
      }finally{h.destroy()}
    });
    it(`${style.inline} arrows traverse all source characters in both directions`,()=>{
      const h=harness(style.inline);
      try{
        click(h.view,0);
        for(let offset=1;offset<=style.inline.length;offset++){
          key(h.view,'ArrowRight');
          expect(h.view.state.selection.main.head).toBe(prefix.length+offset);
        }
        for(let offset=style.inline.length-1;offset>=0;offset--){
          key(h.view,'ArrowLeft');
          expect(h.view.state.selection.main.head).toBe(prefix.length+offset);
        }
        expect(h.view.state.doc.toString()).toBe(prefix+style.inline);
      }finally{h.destroy()}
    });
    it(`${style.inline} Backspace and undo/redo retain exact revealed source positions`,()=>{
      const h=harness(style.inline);
      try{
        click(h.view,style.open.length+1);
        click(h.view,style.open.length);
        key(h.view,'Backspace');
        const edited=prefix+style.inline.slice(0,style.open.length-1)+style.inline.slice(style.open.length);
        expect(h.view.state.doc.toString()).toBe(edited);
        expect(undo(h.view)).toBe(true);
        expect(h.view.state.doc.toString()).toBe(prefix+style.inline);
        expect(h.view.state.selection.main.head).toBe(prefix.length+style.open.length);
        expect(h.markers()).toEqual([style.open,style.close]);
        expect(redo(h.view)).toBe(true);
        expect(h.view.state.doc.toString()).toBe(edited);
      }finally{h.destroy()}
    });
  }

  it.each([
    {inline:'***AAA***',left:3,right:6,markers:['*','*']},
    {inline:'[**AAA**](url "title")',left:3,right:6,markers:['[','](url "title")']},
    {inline:'``AAA``',left:2,right:5,markers:['``','``']}
  ])('maps hidden coincident edges of $inline to the outermost owner',({inline,left,right,markers})=>{
    for(const [incoming,expected] of [[left,0],[right,inline.length]]){
      const h=harness(inline);
      try{
        click(h.view,incoming!);
        expect(h.view.state.selection.main.head).toBe(prefix.length+expected!);
        expect(h.markers()).toEqual(markers);
      }finally{h.destroy()}
    }
  });
  it('maps an inner-only edge and hides the inner pair when leaving it',()=>{
    const h=harness('[x **AAA** y](url)');
    try{
      click(h.view,5);
      expect(h.view.state.selection.main.head).toBe(prefix.length+3);
      expect(h.markers()).toEqual(['[','**','**','](url)']);
      click(h.view,2);
      expect(h.markers()).toEqual(['[','](url)']);
    }finally{h.destroy()}
  });
  it('reveals both adjacent owners at their shared boundary',()=>{
    const h=harness('**AAA**`BBB`');
    try{
      click(h.view,5);
      expect(h.view.state.selection.main.head).toBe(prefix.length+7);
      expect(h.markers()).toEqual(['**','**','`','`']);
      key(h.view,'ArrowRight');
      expect(h.view.state.selection.main.head).toBe(prefix.length+8);
      expect(h.markers()).toEqual(['`','`']);
    }finally{h.destroy()}
  });
  it('keeps separated siblings hidden and hides all markers in the intervening space',()=>{
    const h=harness('**AAA**  `BBB`');
    try{
      click(h.view,2);
      expect(h.markers()).toEqual(['**','**']);
      click(h.view,8);
      expect(h.markers()).toEqual([]);
    }finally{h.destroy()}
  });
  it('preserves noncollapsed pointer selections, backward selections, and Shift navigation',()=>{
    const h=harness('**AAA**');
    try{
      for(const [anchor,head] of [[2,5],[5,2]]){
        h.view.dispatch({selection:{anchor:prefix.length+anchor!,head:prefix.length+head!},userEvent:'select.pointer'});
        expect(h.view.state.selection.main.anchor).toBe(prefix.length+anchor!);
        expect(h.view.state.selection.main.head).toBe(prefix.length+head!);
      }
      click(h.view,0);
      for(let offset=1;offset<=7;offset++){
        key(h.view,'ArrowRight',true);
        expect(h.view.state.selection.main.anchor).toBe(prefix.length);
        expect(h.view.state.selection.main.head).toBe(prefix.length+offset);
      }
    }finally{h.destroy()}
  });
  it('maps the first unfocused pointer entry then reveals the pair upon focus',()=>{
    const h=harness('**AAA**');
    const button=document.body.appendChild(document.createElement('button'));
    try{
      button.focus();
      expect(h.markers()).toEqual([]);
      click(h.view,5);
      expect(h.view.state.selection.main.head).toBe(prefix.length+7);
      h.view.focus();
      expect(h.markers()).toEqual(['**','**']);
    }finally{button.remove();h.destroy()}
  });
  it('uses pre-focus hidden presentation in CodeMirror mousedown dispatch order',async()=>{
    let incoming=0;
    const order:string[]=[];
    const h=harness('**AAA**',{extra:EditorView.mouseSelectionStyle.of(view=>{
      order.push(view.hasFocus?'hit-focused':'hit-blurred');
      return {get(){order.push(view.hasFocus?'select-focused':'select-blurred');return EditorSelection.single(incoming)},update(){return false}};
    })});
    const button=document.body.appendChild(document.createElement('button'));
    try{
      click(h.view,3);
      button.focus();
      await Promise.resolve();
      expect(h.markers()).toEqual([]);
      const text=h.host.querySelector('.cm-inactive-inline-strong')!.firstChild!;
      incoming=h.view.posAtDOM(text,3);
      expect(incoming).toBe(prefix.length+5);
      h.view.contentDOM.dispatchEvent(new MouseEvent('mousedown',{button:0,detail:1,bubbles:true,cancelable:true}));
      expect(order).toEqual(['hit-blurred','select-focused']);
      expect(h.view.state.selection.main.head).toBe(prefix.length+7);
      expect(h.markers()).toEqual(['**','**']);
      document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));
    }finally{button.remove();h.destroy()}
  });
  it('preserves reading suppression and maps entry when the host requests editing',()=>{
    const h=harness('**AAA**');
    try{
      setHeadingPresentation(h.view,'reading');
      h.view.dispatch({selection:{anchor:prefix.length+2},userEvent:'select.pointer',effects:setHeadingPresentationEffect.of('editing')});
      expect(h.view.state.selection.main.head).toBe(prefix.length);
      expect(h.markers()).toEqual(['**','**']);
      setHeadingPresentation(h.view,'reading');
      expect(h.markers()).toEqual([]);
    }finally{h.destroy()}
  });
  it('allows selection but prevents Backspace changes in read-only content',()=>{
    const h=harness('**AAA**',{readOnly:true});
    try{
      click(h.view,2);
      expect(h.view.state.selection.main.head).toBe(prefix.length);
      key(h.view,'ArrowRight');
      key(h.view,'Backspace');
      expect(h.view.state.doc.toString()).toBe(prefix+'**AAA**');
      expect(undo(h.view)).toBe(false);
    }finally{h.destroy()}
  });
  it('does not remap source-mode positions',()=>{
    const h=harness('**AAA**',{source:true});
    try{
      for(const offset of [2,5]){
        click(h.view,offset);
        expect(h.view.state.selection.main.head).toBe(prefix.length+offset);
      }
    }finally{h.destroy()}
  });
});
