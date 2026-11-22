import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** A collapsible banner: icon, title, one-line summary and a status chip. Click the banner to show the details. */
export function Fold({icon,title,summary,badge,tone='neutral',open=false,className='',children}:{icon:ReactNode;title:string;summary?:ReactNode;badge?:ReactNode;tone?:'neutral'|'ok'|'warn'|'risk'|'info';open?:boolean;className?:string;children:ReactNode}){
 return <details className={'fold fold-'+tone+(className?' '+className:'')} open={open||undefined}><summary><span className="fold-icon">{icon}</span><span className="fold-text"><strong>{title}</strong>{summary&&<small>{summary}</small>}</span>{badge!==undefined&&badge!==''&&<span className="fold-badge">{badge}</span>}<ChevronDown size={18} className="fold-chevron"/></summary><div className="fold-body">{children}</div></details>;
}
