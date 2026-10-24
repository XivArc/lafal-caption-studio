const NAME='lafal-studio-v1';let dbPromise;
function db(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(NAME,1);
    request.onupgradeneeded=()=>{const d=request.result;d.createObjectStore('projects',{keyPath:'id'});d.createObjectStore('media');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return dbPromise;
}
async function transaction(store,mode,fn){
  const database=await db();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(store,mode),s=tx.objectStore(store);let result;
    const req=fn(s);req.onsuccess=()=>{result=req.result;};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Penyimpanan dibatalkan'));
  });
}
export const saveProject=project=>transaction('projects','readwrite',s=>s.put(project));
export const getProject=id=>transaction('projects','readonly',s=>s.get(id));
export const listProjects=async()=> (await transaction('projects','readonly',s=>s.getAll())).sort((a,b)=>b.updatedAt-a.updatedAt);
export const putMedia=(id,blob)=>transaction('media','readwrite',s=>s.put(blob,id));
export const getMedia=id=>transaction('media','readonly',s=>s.get(id));
export async function deleteProject(id){await transaction('projects','readwrite',s=>s.delete(id));await transaction('media','readwrite',s=>s.delete(id));}
