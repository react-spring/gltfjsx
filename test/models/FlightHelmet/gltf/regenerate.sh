#!/bin/bash

rm -f  *.tsx *-transformed.glb
npx gltfjsx ./FlightHelmet.gltf -o OldReference.tsx --types --keepnames --shadows
# npx gltfjsx ./FlightHelmet.gltf -o OldReferenceInstance.tsx --types --keepnames --shadows --instance
# npx gltfjsx ./FlightHelmet.gltf -o OldReferenceInstanceall.tsx --types --keepnames --shadows --instanceall