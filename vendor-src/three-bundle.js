// Builds media/vendor/three.bundle.js: three.js + glTF loading as a plain script (window.THREE).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

window.THREE = { ...THREE, GLTFLoader, RoomEnvironment, MeshoptDecoder };
