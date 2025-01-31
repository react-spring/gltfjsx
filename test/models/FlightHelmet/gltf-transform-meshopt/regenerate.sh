#!/bin/bash

rm -f *.glb *.tsx
gltf-transform meshopt ../gltf/FlightHelmet.gltf ./FlightHelmet.glb
npx gltfjsx ./FlightHelmet.glb -o OldReference.tsx --types --keepnames --shadows