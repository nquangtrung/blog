---
title: Firebase Functions cross projects invocation
date: 2022-10-11T04:15:31.722Z
draft: false
---


![](https://cdn-images-1.medium.com/max/2000/1*GGVT5RbeLVC8plI5BehBag.png)

Our team is developing an appraisal feature that allow a property’s owner to be able to appraise their premise base on some of the property’s characteristic. We have already had a system that will preprocess this information, like geocoding, tagging near by landmarks, etc., which was written in NodeJS. But our new appraisal component is a regression model that was written in Python, and we’ve decided to separate the new component into a different Firebase project so that maybe in the future we can publish this API as a standalone product. With that said, for now, we need a quick and easy way for our internal functions to be able to call each other and still does not allow public access.

Even though Google documentation has this [post](https://cloud.google.com/functions/docs/securing/authenticating) explaining how to authenticate your Google Cloud Function request. Firebase Functions is basically Google Cloud Function with some added quality-of-life improvement to make your development process easier. However, to me it seems to be too complicated and obscure if you’re not very familiar with GCP IAM or [Firebase https.onCall protocol](https://firebase.google.com/docs/functions/callable-reference) to make it work easily. So this is a quick and concise tutorial for calling Firebase Functions from another Firebase project’s function.

From now on, I will refer to the `Firebase Functions` that being called as **receiving function**, the *Firebase Functions* that is calling as **calling function**, and the original Google document as **the document**.

## Allow calling function to invoke the receiving function

This step is quite straight forward, you should be able to follow **the document**’s instruction easily. In short, you need to grant the role *Cloud Functions Invoker (roles/cloudfunctions.invoker)* of the **receiving function** to the **calling function**’s service account email.  
How to find the **calling function**’s service account email:

> 1. Go to the **Google Cloud Console** > **Cloud Functions** > select the **calling function**’s project.
> 2. Click on the **calling function**’s name.
> 3. Go to **Details** tab.
> 4. You will find the service account email in **General Information** > **Service account**.

Another note is that if you’re running Firebase Functions’ shell or emulator, you will also need to add the service account that you’re using to authenticate to the **receiving function**’s *Cloud Functions Invoker* role. For example, if you’re running the shell locally like this:
{{< gist nquangtrung 2fc04287fa9ec44b4fbf4a20a0eca48a >}}
You will be able to find the service account in your json file, look for *client_email* value.

## Calling the receiving function

Now your **calling function** can be authenticated to call the **receiving function**, but you will need to be able to provide an ID token to include with your request. As stated in the document, the easiest way to do that is to use [google-auth-library](https://www.npmjs.com/package/google-auth-library) to request. Please see the snippet for the detail implementation. This example should retrieve the ID Token and call the **receiving function** and return its result for you.
{{< gist nquangtrung 8f6e3957df955e9b9c885ab25f72174d >}}
Please pay attention to the `const targetAudience = url` (line 15). According to the document and the example source code, it seems that *targetAudience* should be the origin of the URL (?), meaning `https://region-project-id.cloudfunctions.net` in this example. I don’t know if it’s a mistake but as I tried **the document**’s example code, it simply does not work, and Google cloud does not give us any log of what’s the problem. After several trial and error, audience needs to be full URL.

Also, see line 24, this line is optional, the default `Content-Type` is `text/plain`, it would not be any problem if your deployment can support this. However, Firebase Functions requires the *application/json* content type and will give you the incorrect content type error if you skip this line.

> Request has incorrect Content-Type. text/plain

## Note on how to deploy receiving function
As you know Firebase Functions allow *https.onRequest* and *https.onCall* helpers to deploy. The former *https.onRequest* is plain Google Cloud function, and *https.onCall* is basically *https.onRequest* with a special protocol to easily authenticate your request with Firebase Authentication. However, as you notice above, we’re not using Firebase Authentication to authenticate the request, so if we’re use *https.onCall* in this case, it would not work, it would simply show this error for wrong audience.
{{< gist nquangtrung 1e0655bda5b0a02ea3da5950bd3a6036 >}}
What you should do is using *https.onRequest* protocol that does not include a Firebase Authentication step. For example:
{{< gist nquangtrung e3dc994d8253be600649281a970c2682 >}}
That’s it. You should be able to call Firebase Functions across projects with ease.
