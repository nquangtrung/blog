---
title: Deploy multiple React apps to Firebase Hosting using single codebase
date: 2022-09-12T04:15:31.724Z
draft: false
---

Let's say you're developing a system that should provide different applications to different user base, and you want to re-use the code that you have already implemented in those applications, you basically have these 2 choices:

- Create and manage multiple codebases for sharing components and functions between applications and those applications as well. It works but it might be too much if most of the shared components are developed specifically to these applications, and would not be used again in another project, not to mention the time to manage, and and deployment preparation for all these codebase.
- Restructuring the old codebase that host all of those applications and the shared components. Its downside is for bigger project, this codebase will balloon up, and become harder to manage, but it's quick and easy.

In this post I'm not discussing about the pros and cons of these solutions, I will only go in detail on the 2nd choice, hence the title.

In real life, we employ the 3rd option, a mix of the 2 for our development process. While this post use `yarn` as dependency manager, `npm` would also work similarly.  

## Restructuring create-react-app folder

We have to start somewhere. For creating a simple react app, you will start with `create-react-app` library. And for firebase, we use `firebase init` command.  
The default folder structure after running these commands:

```bash
...
|--package.json
|--firebase.json
|--src
|--|--index.tsx
|--|--App.tsx
|--|--components
...
```

Where `index.tsx` and `App.tsx` is the entry for our single app. Now we want to re-structure it to support multiple apps, in this case, we have 2 different applications for `customer` and `manager`, and we put them in the `apps` folder:

```bash
...
|--package.json
|--firebase.json
|--src
|--|--apps
|--|--|--manager
|--|--|--|--index.tsx
|--|--|--|--App.tsx
|--|--|--customer
|--|--|--|--index.tsx
|--|--|--|--App.tsx
|--|--index.ts
|--|--components
...
```

Updated `src/index.ts`:
{{< gist nquangtrung 5bcc12f572ee7e07951f57d09866cdc9 >}}
Then we will have the similar entry for each of the application inside `apps`:
{{< gist nquangtrung 6112baa21d4e2fe4c546ff925c4e4acc >}}
And now we can start to implement our 2 apps within the same codebase, using shared `components` and other `utilities`.

## Switching between applications

So far so good, but how would you develop and deploy the 2 applications independently?  
You can see that inside `index.ts`, we're using `process.env.REACT_APP_TARGET` for switching between 2 applications. You guessed it, we just need to provide the correct environment variable and we can target whichever application we like.  
Updated `package.json`. Please note that this is an ejected react codebase, you can use the same method for not-yet-ejected codebase.
{{< gist nquangtrung 2ac3eb741633b4eee3e2d0b2d0ca4a9b >}}
During development, instead of using `yarn start` we can use `yarn start:customer` and `yarn start:manager` for the respective application. The same would be applied for `yarn build` and `yarn deploy`

## Building and Firebase hosting deployment

First we need to update `create-react-app`'s build command, by default this command build the app into `dist`. We want 2 apps to be built now, and we don't want them to use the same folder, because, we might deploy wrong application or what not. Luckily this build command supports `BUILD_PATH` environment variable, so we can specify 2 different folder for the 2 applications `./out/customer` and `./out/manager`. Don't forget to add `out/*` to `.gitignore` though.  

With the build command finally done, the last step is to deploy it to Firebase hosting.
Updated `firebase.json`:
{{< gist nquangtrung a85f915dc58948e0722524a40bebaf5d >}}
The 3 line that we want to update are below

```text
...
"target": "customer",
"public": "out/customer",
"predeploy": [
  "yarn build:customer"
]
```

With `"target": "customer"` we can specify to deploy only customer app by using

```bash
firebase deploy --only hosting:customer
```

And `public` is the output folder previously mentioned. Lastly `predeploy` will specify the commands that we want to run prior to deploy, in this case, we want to build the corresponding app.  

And that's it! Code and deploy away.
