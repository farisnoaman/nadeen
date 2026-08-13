export async function api<T=any>(path:string,options:RequestInit={}){
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Something went wrong');return data as T;
}
