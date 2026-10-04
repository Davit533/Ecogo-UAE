import type {NextAuthOptions} from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import {compare} from 'bcryptjs';
import {db} from '@/lib/db';
import {rateLimit} from './security';
export const authOptions:NextAuthOptions={
  secret:process.env.NEXTAUTH_SECRET,
  session:{strategy:'jwt',maxAge:7*86400},
  pages:{signIn:'/sign-in'},
  providers:[Credentials({name:'Email and password',credentials:{email:{label:'Email',type:'email'},password:{label:'Password',type:'password'}},async authorize(credentials){
    const email=credentials?.email?.trim().toLowerCase(); if(!email||!credentials?.password)return null;
    await rateLimit(`login:${email}`,15,900);
    const user=await db.user.findUnique({where:{email},include:{child:true}});
    if(!user || user.banned || !await compare(credentials.password,user.passwordHash))return null;
    if(!user.verifiedAt) throw new Error('Please verify your email before signing in.');
    if(user.role==='CHILD'&&!user.child?.approvedAt)throw new Error('A guardian must approve this account first.');
    return {id:user.id,email:user.email,name:user.name,sessionVersion:user.sessionVersion};
  }})],
  callbacks:{
    async jwt({token,user}){if(user){token.uid=user.id;token.version=(user as unknown as {sessionVersion:number}).sessionVersion;}return token;},
    async session({session,token}){const user=await db.user.findUnique({where:{id:String(token.uid)}});if(!user||user.banned||user.sessionVersion!==token.version){session.user=undefined;return session;}return session;}
  }
};
