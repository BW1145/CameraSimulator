import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../diagnostics/library-dof/',import.meta.url));
await build({root,configFile:false,base:'./',build:{outDir:fileURLToPath(new URL('../dist/dof-fixture/',import.meta.url)),emptyOutDir:true}});
