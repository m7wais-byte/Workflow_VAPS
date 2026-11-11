'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { addListValue, requestListLabels, type RequestLists } from './request-book';

const listNotes: Record<keyof RequestLists, string> = {
  clients: 'Clients offered on the request form.',
  experiments: 'Experiments a request can be raised for.',
  doneBy: 'Names offered under “Done by”.',
  balloons: 'Gas balloon numbers offered for each stage.',
};

/**
 * Settings → Request Book lists: the values behind the dropdowns of the request form. Each change is saved at once.
 * Removing a value only takes it out of the dropdown; requests already saved with it are never changed.
 */
export function RequestListSettings({ lists, error, onSave }: { lists: RequestLists; error: string; onSave: (lists: RequestLists) => boolean }) {
  const [text, setText] = useState<Record<string, string>>({}), [problem, setProblem] = useState<Record<string, string>>({}), [message, setMessage] = useState('');
  const add = (key: keyof RequestLists) => {
    try {
      const next = addListValue(lists[key], text[key] || '');
      if (!onSave({ ...lists, [key]: next })) throw Error('The list could not be saved.');
      setMessage(`“${next[next.length - 1]}” added to ${requestListLabels[key]}.`); setText({ ...text, [key]: '' }); setProblem({});
    } catch (e) { setProblem({ [key]: (e as Error).message }); setMessage(''); }
  };
  const remove = (key: keyof RequestLists, value: string) => {
    if (!window.confirm(`Remove “${value}” from ${requestListLabels[key]}? Requests already saved with it are not changed.`)) return;
    if (onSave({ ...lists, [key]: lists[key].filter((item) => item !== value) })) { setMessage(`“${value}” removed from ${requestListLabels[key]}.`); setProblem({}); }
  };
  return <>
    {error && <p role="alert">{error}</p>}
    <p role="status">{message}</p>
    <div className="rq-lists">{(Object.keys(requestListLabels) as (keyof RequestLists)[]).map((key) => <section className="panel settings-panel" key={key}>
      <div className="panel-heading"><div><h2>{requestListLabels[key]} <span className="scope-chip">{lists[key].length}</span></h2><p>{listNotes[key]}</p></div></div>
      <form className="rq-list-add" onSubmit={(e) => { e.preventDefault(); add(key); }}>
        <label><span className="sr-only">New value for {requestListLabels[key]}</span><input value={text[key] || ''} maxLength={60} placeholder="Type a new value" disabled={!!error} onChange={(e) => setText({ ...text, [key]: e.target.value })} /></label>
        <button className="outline-button" disabled={!!error}><Plus size={14} aria-hidden="true" /> Add</button>
      </form>
      {problem[key] && <p className="ops-error" role="alert">{problem[key]}</p>}
      <ul className="rq-list">{lists[key].map((value) => <li key={value}><span>{value}</span><button type="button" className="text-button" disabled={!!error} onClick={() => remove(key, value)} aria-label={`Remove ${value}`}><Trash2 size={14} aria-hidden="true" /> Remove</button></li>)}
        {!lists[key].length && <li><span className="filter-note">This list is empty. The form still offers “Other…”.</span></li>}</ul>
    </section>)}</div>
  </>;
}
