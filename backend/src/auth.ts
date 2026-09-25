import type {NextFunction,Request,Response} from 'express';
import jwt from 'jsonwebtoken';
import {config} from './config.js';
export type AuthRequest=Request & {user?:{sub:string,email:string,role:string}};
export function signToken(user:{id:string,email:string,role:string}) {
  return jwt.sign({sub:user.id,email:user.email,role:user.role},config.jwtSecret,{expiresIn:'12h'});
}
export function requireAuth(req:AuthRequest,res:Response,next:NextFunction) {
  const value=req.headers.authorization;
  if(!value?.startsWith('Bearer ')) return res.status(401).json({error:'unauthorized'});
  try { req.user=jwt.verify(value.slice(7),config.jwtSecret) as AuthRequest['user']; next(); }
  catch { res.status(401).json({error:'invalid_token'}); }
}
