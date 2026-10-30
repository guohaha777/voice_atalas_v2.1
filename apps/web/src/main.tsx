import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './app/App';
import {ErrorBoundary} from './app/ErrorBoundary';
import './styles/global.css';
import {guestWorkReady} from './app/services';
const root=document.getElementById('root');
if(!root)throw new Error('Missing root element');
// A visitor's kept work comes back before the pages read it; never wait long (the boot text shows meanwhile).
void Promise.race([guestWorkReady,new Promise(resolve=>setTimeout(resolve,4000))]).finally(()=>
 createRoot(root).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>));
