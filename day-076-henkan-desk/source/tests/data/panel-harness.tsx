import { useMemo,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataPanel } from '../../src/features/data/DataPanel';
import { DATA_OPERATIONS,type DataOperation } from '../../src/features/data/operations';
import { useConversion } from '../../src/app/useConversion';
import '../../src/app/app.css';
function PanelHarness(){
 const [text,setText]=useState('name,id\n田中,001'),[operation,setOperation]=useState<DataOperation>('csv-json');
 const sources=useMemo(()=>[{id:crypto.randomUUID(),file:new File([text],'pasted.txt',{type:'text/plain;charset=utf-8'})}],[text,operation]);
 const conversion=useConversion(sources);
 return <div style={{maxWidth:600,padding:24}}><label>Test operation<select aria-label="Test operation" value={operation} onChange={e=>setOperation(e.target.value as DataOperation)}>{DATA_OPERATIONS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Test input<textarea aria-label="Test input" rows={6} value={text} onChange={e=>setText(e.target.value)}/></label><DataPanel sources={sources} startRun={conversion.startRun} busy={conversion.busy} operation={operation}/><button onClick={conversion.cancel}>Cancel test run</button></div>;
}
const target=document.createElement('div');target.id='data-panel-root';document.body.append(target);createRoot(target).render(<PanelHarness/>);
