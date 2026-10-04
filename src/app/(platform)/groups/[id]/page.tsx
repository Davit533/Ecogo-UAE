import {GroupPage} from '@/components/community';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <GroupPage id={id}/>;}
