'use client';

import { useState } from 'react';
import * as THREE from 'three';
import GLTFViewer from './GLTFViewer';
import ValidationModal from './ValidationModal';

interface ValidationResult {
  type: 'warning' | 'error' | 'info';
  message: string;
  details?: string;
}

interface GLTFValidatorProps {
  onValidationComplete?: (results: ValidationResult[]) => void;
}

export default function GLTFValidator({ onValidationComplete }: GLTFValidatorProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileList | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [polygonCount, setPolygonCount] = useState<number | null>(null);
  const [meshCount, setMeshCount] = useState<number | null>(null);
  const [showNegativeFaces, setShowNegativeFaces] = useState(false);

  const validateGLTF = async (file: File, supportFiles?: FileList) => {
    setIsValidating(true);
    const validationResults: ValidationResult[] = [];

    try {
      const arrayBuffer = await file.arrayBuffer();

      // サポートファイル（bin、画像など）をマップ化
      const fileMap = new Map<string, string>();
      if (supportFiles) {
        for (let i = 0; i < supportFiles.length; i++) {
          const supportFile = supportFiles[i];
          const url = URL.createObjectURL(supportFile);
          fileMap.set(supportFile.name, url);
        }
      }

      // 動的インポートでGLTFLoaderとDracoLoaderを読み込み
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');

      const loader = new GLTFLoader();

      // DRACOLoaderの設定
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(dracoLoader);

      // LoadingManagerを使用して外部ファイルの読み込みを解決
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        const filename = url.split('/').pop() || url;
        if (fileMap.has(filename)) {
          return fileMap.get(filename)!;
        }
        return url;
      });
      loader.manager = manager;

      loader.parse(arrayBuffer, '', (gltf) => {
        const scene = gltf.scene;
        const animations = gltf.animations;

        validateTextures(scene, validationResults);
        const totalPolygons = validatePolygonCount(scene, validationResults);
        setPolygonCount(totalPolygons);
        const totalMeshes = validateMeshCount(scene, validationResults);
        setMeshCount(totalMeshes);
        validateScaleValues(scene, validationResults);
        validateAnimations(animations, scene, validationResults);
        validateMeshHierarchy(scene, validationResults);
        validateObjectNames(scene, validationResults);
        validateUniqueIds(gltf, validationResults);
        validateBoneStructure(scene, animations, validationResults);

        setResults(validationResults);
        onValidationComplete?.(validationResults);
        setIsValidating(false);
        
        // Auto-open modal if there are errors or warnings
        const hasIssues = validationResults.some(r => r.type === 'error' || r.type === 'warning');
        if (hasIssues) {
          setIsModalOpen(true);
        }
      }, (error) => {
        validationResults.push({
          type: 'error',
          message: 'Failed to load GLTF file',
          details: error.toString()
        });
        setResults(validationResults);
        setIsValidating(false);
        
        // Auto-open modal for errors
        setIsModalOpen(true);
      });
    } catch (error) {
      validationResults.push({
        type: 'error',
        message: 'Error occurred while processing file',
        details: error instanceof Error ? error.message : String(error)
      });
      setResults(validationResults);
      setIsValidating(false);
      
      // Auto-open modal for errors
      setIsModalOpen(true);
    }
  };

  const validateTextures = (scene: THREE.Object3D, results: ValidationResult[]) => {
    const textures = new Set<THREE.Texture>();

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            if (material.map) textures.add(material.map);
            if (material.normalMap) textures.add(material.normalMap);
            if (material.roughnessMap) textures.add(material.roughnessMap);
            if (material.metalnessMap) textures.add(material.metalnessMap);
          }
        });
      }
    });

    textures.forEach((texture) => {
      if (texture.image) {
        // Check texture size
        const width = texture.image.width;
        const height = texture.image.height;

        if (width >= 2001 || height >= 2001) {
          const textureName = texture.name || 'Unnamed texture';
          results.push({
            type: 'warning',
            message: 'Texture size too large',
            details: `Texture "${textureName}" has dimensions ${width}x${height}px. Textures larger than 2000px may cause performance issues. Consider reducing the texture size.`
          });
        }

        // Check texture format
        if (texture.image.src) {
          const src = texture.image.src.toLowerCase();
          if (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png')) {
            results.push({
              type: 'warning',
              message: 'Texture format optimization recommended',
              details: `Converting JPEG/PNG textures to WebP format can reduce file size significantly.`
            });
          }
        }
      }
    });
  };

  const validatePolygonCount = (scene: THREE.Object3D, results: ValidationResult[]): number => {
    let totalPolygons = 0;

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const geometry = child.geometry;
        const positions = geometry.attributes.position;
        if (positions) {
          totalPolygons += positions.count / 3;
        }
      }
    });

    if (totalPolygons > 50000) {
      results.push({
        type: 'warning',
        message: 'Polygon count too high',
        details: `Current polygon count: ${Math.round(totalPolygons).toLocaleString()}. Recommend reducing to under 50,000 for better performance.`
      });
    }

    return Math.round(totalPolygons);
  };

  const validateMeshCount = (scene: THREE.Object3D, results: ValidationResult[]): number => {
    let meshCount = 0;

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
      }
    });

    if (meshCount >= 51) {
      results.push({
        type: 'warning',
        message: 'Mesh count too high',
        details: `Current mesh count: ${meshCount}. Having 51 or more meshes may impact performance. Consider combining meshes where possible.`
      });
    }

    return meshCount;
  };

  const validateScaleValues = (scene: THREE.Object3D, results: ValidationResult[]) => {
    scene.traverse((child) => {
      if (child.scale.x < 0 || child.scale.y < 0 || child.scale.z < 0) {
        results.push({
          type: 'warning',
          message: 'Negative scale values detected',
          details: `Object "${child.name || 'Unnamed'}" has negative scale values. This may cause object distortion.`
        });
      }
    });
  };

  const validateAnimations = (animations: THREE.AnimationClip[], scene: THREE.Object3D, results: ValidationResult[]) => {
    animations.forEach((clip) => {
      clip.tracks.forEach((track) => {
        if (track.name.includes('.scale')) {
          const values = track.values;
          if (values && values.length > 0) {
            const startScale = Math.min(values[0], values[1], values[2]);
            if (startScale === 0) {
              results.push({
                type: 'warning',
                message: 'Scale animation starts with zero value',
                details: `Animation "${clip.name}" has scale starting value set to 0. This may cause object distortion.`
              });
            }
          }
        }
      });
    });
  };

  const validateMeshHierarchy = (scene: THREE.Object3D, results: ValidationResult[]) => {
    const checkDepth = (object: THREE.Object3D, depth: number = 0): number => {
      let maxDepth = depth;
      object.children.forEach((child) => {
        const childDepth = checkDepth(child, depth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
      });
      return maxDepth;
    };

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const depth = checkDepth(child);
        if (depth > 5) {
          results.push({
            type: 'warning',
            message: 'Deep mesh hierarchy detected',
            details: `Mesh "${child.name || 'Unnamed'}" is in deep hierarchy (${depth} levels). This may impact performance.`
          });
        }
      }
    });
  };

  const validateObjectNames = (scene: THREE.Object3D, results: ValidationResult[]) => {
    // Regex to detect non-ASCII characters (anything that's not alphanumeric or common symbols)
    const nonASCIIRegex = /[^\x00-\x7F]/;

    scene.traverse((child) => {
      console.log('child.name :>> ', child.name);
      if (child.name && nonASCIIRegex.test(child.name)) {
        results.push({
          type: 'warning',
          message: 'Non-ASCII characters in object name',
          details: `Object "${child.name}" contains non-ASCII characters. Consider using ASCII names for better USD compatibility.`
        });
      }

      console.log('child.name  :>> ', child.name );
      // Check for spaces in object names
      if (child.name && child.name.includes(' ')) {
        results.push({
          type: 'warning',
          message: 'Space character in object name',
          details: `Object "${child.name}" contains spaces. Consider using underscores or camelCase for better USD compatibility.`
        });
      }

      // Check for material names if it's a mesh
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material.name && nonASCIIRegex.test(material.name)) {
            results.push({
              type: 'warning',
              message: 'Non-ASCII characters in material name',
              details: `Material "${material.name}" contains non-ASCII characters. Consider using ASCII names for better USD compatibility.`
            });
          }

          // Check for spaces in material names
          if (material.name && material.name.includes(' ')) {
            results.push({
              type: 'warning',
              message: 'Space character in material name',
              details: `Material "${material.name}" contains spaces. Consider using underscores or camelCase for better USD compatibility.`
            });
          }

          // Check texture file names
          if (material instanceof THREE.MeshStandardMaterial) {
            const textures = [
              { texture: material.map, type: 'map' },
              { texture: material.normalMap, type: 'normalMap' },
              { texture: material.roughnessMap, type: 'roughnessMap' },
              { texture: material.metalnessMap, type: 'metalnessMap' },
              { texture: material.emissiveMap, type: 'emissiveMap' },
              { texture: material.aoMap, type: 'aoMap' }
            ];

            textures.forEach(({ texture, type }) => {
              if (texture) {
                console.log('texture :>> ', type, texture);
                console.log('texture.name :>> ', texture.name);
                console.log('texture.image :>> ', texture.image);
                if (texture.image) {
                  console.log('texture.image.src :>> ', texture.image.src);
                }

                // Check texture.name (from GLTF images[].name)
                if (texture.name) {
                  if (nonASCIIRegex.test(texture.name)) {
                    results.push({
                      type: 'warning',
                      message: 'Non-ASCII characters in texture name',
                      details: `Texture "${texture.name}" (${type}) contains non-ASCII characters. Consider using ASCII names for better USD compatibility.`
                    });
                  }

                  if (texture.name.includes(' ')) {
                    results.push({
                      type: 'warning',
                      message: 'Space character in texture name',
                      details: `Texture "${texture.name}" (${type}) contains spaces. Consider using underscores or camelCase for better USD compatibility.`
                    });
                  }
                }

                // Check filename from src (from GLTF images[].uri)
                if (texture.image && texture.image.src) {
                  const src = texture.image.src;
                  const filename = src.split('/').pop()?.split('?')[0] || src;

                  if (nonASCIIRegex.test(filename)) {
                    results.push({
                      type: 'warning',
                      message: 'Non-ASCII characters in texture filename',
                      details: `Texture file "${filename}" (${type}) contains non-ASCII characters. Consider using ASCII names for better USD compatibility.`
                    });
                  }

                  if (filename.includes(' ')) {
                    results.push({
                      type: 'warning',
                      message: 'Space character in texture filename',
                      details: `Texture file "${filename}" (${type}) contains spaces. Consider using underscores or camelCase for better USD compatibility.`
                    });
                  }
                }
              }
            });
          }
        });
      }
    });
  };

  const validateBoneStructure = (scene: THREE.Object3D, animations: THREE.AnimationClip[], results: ValidationResult[]) => {
    // Check if there are any animations
    if (!animations || animations.length === 0) {
      // No animations, skip bone validation
      return;
    }

    // Check if any animation targets bones
    let hasBoneAnimation = false;
    for (const clip of animations) {
      for (const track of clip.tracks) {
        // Check if the track targets a bone (bone names typically appear in track names)
        // Track names are in format: "boneName.property"
        const trackTargetPath = track.name.split('.')[0];

        // Verify if this target corresponds to an actual bone in the scene
        scene.traverse((child) => {
          if (child instanceof THREE.Bone && (child.name === trackTargetPath || child.uuid === trackTargetPath)) {
            hasBoneAnimation = true;
          }
        });

        if (hasBoneAnimation) break;
      }
      if (hasBoneAnimation) break;
    }

    if (!hasBoneAnimation) {
      // No bone animations found, skip validation
      return;
    }

    const bones: THREE.Bone[] = [];

    // Collect all bones in the scene
    scene.traverse((child) => {
      if (child instanceof THREE.Bone) {
        bones.push(child);
      }
    });

    if (bones.length === 0) {
      // No bones found, skip validation
      return;
    }

    // Find root bones (bones that don't have a bone parent)
    const rootBones = bones.filter((bone) => {
      let parent = bone.parent;
      while (parent) {
        if (parent instanceof THREE.Bone) {
          return false; // This bone has a bone parent
        }
        parent = parent.parent;
      }
      return true; // This bone has no bone parent, it's a root
    });

    if (rootBones.length > 1) {
      const rootBoneNames = rootBones.map(bone => bone.name || 'Unnamed').join(', ');
      results.push({
        type: 'warning',
        message: 'Multiple bone roots detected',
        details: `Found ${rootBones.length} root bones: ${rootBoneNames}. Multiple bone roots may cause animation to break when converting to USD. Consider using a single root bone for better compatibility.`
      });
    }
  };

  const validateUniqueIds = (gltf: { parser?: { json?: { nodes?: { name?: string }[], materials?: { name?: string }[], meshes?: { name?: string }[] } } }, results: ValidationResult[]) => {
    const nodeNames = new Set<string>();
    const materialNames = new Set<string>();
    const meshNames = new Set<string>();
    const duplicateNodes: string[] = [];
    const duplicateMaterials: string[] = [];
    const duplicateMeshes: string[] = [];

    // Check node names
    if (gltf.parser?.json?.nodes) {
      gltf.parser.json.nodes.forEach((node: { name?: string }, index: number) => {
        const name = node.name || `Node_${index}`;
        if (nodeNames.has(name)) {
          duplicateNodes.push(name);
        } else {
          nodeNames.add(name);
        }
      });
    }

    // Check material names
    if (gltf.parser?.json?.materials) {
      gltf.parser.json.materials.forEach((material: { name?: string }, index: number) => {
        const name = material.name || `Material_${index}`;
        if (materialNames.has(name)) {
          duplicateMaterials.push(name);
        } else {
          materialNames.add(name);
        }
      });
    }

    // Check mesh names
    if (gltf.parser?.json?.meshes) {
      gltf.parser.json.meshes.forEach((mesh: { name?: string }, index: number) => {
        const name = mesh.name || `Mesh_${index}`;
        if (meshNames.has(name)) {
          duplicateMeshes.push(name);
        } else {
          meshNames.add(name);
        }
      });
    }

    // Report duplicate names
    if (duplicateNodes.length > 0) {
      results.push({
        type: 'warning',
        message: 'Duplicate node names detected',
        details: `Non-unique node names found: ${duplicateNodes.join(', ')}. This may cause issues in USD workflows.`
      });
    }

    if (duplicateMaterials.length > 0) {
      results.push({
        type: 'warning',
        message: 'Duplicate material names detected',
        details: `Non-unique material names found: ${duplicateMaterials.join(', ')}. This may cause issues in USD workflows.`
      });
    }

    if (duplicateMeshes.length > 0) {
      results.push({
        type: 'warning',
        message: 'Duplicate mesh names detected',
        details: `Non-unique mesh names found: ${duplicateMeshes.join(', ')}. This may cause issues in USD workflows.`
      });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // GLTFまたはGLBファイルを探す
    let gltfFile: File | null = null;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.gltf') || file.name.toLowerCase().endsWith('.glb')) {
        gltfFile = file;
        break;
      }
    }

    if (gltfFile) {
      setUploadedFile(gltfFile);
      setUploadedFiles(files);
      validateGLTF(gltfFile, files);
    } else {
      setUploadedFile(null);
      setUploadedFiles(null);
      setPolygonCount(null);
      setMeshCount(null);
      setResults([{
        type: 'error',
        message: 'Unsupported file format',
        details: 'Please upload a GLTF (.gltf) or GLB (.glb) file.'
      }]);
      setIsModalOpen(true);
    }
  };

  const hasErrors = results.some(r => r.type === 'error');
  const hasWarnings = results.some(r => r.type === 'warning');
  const hasIssues = hasErrors || hasWarnings;

  const getStatusIcon = () => {
    if (hasErrors) {
      return (
        <div className="flex items-center space-x-2 text-red-600">
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Errors Found</span>
        </div>
      );
    } else if (hasWarnings) {
      return (
        <div className="flex items-center space-x-2 text-yellow-600">
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Warnings Found</span>
        </div>
      );
    } else if (results.length === 0) {
      return (
        <div className="flex items-center space-x-2 text-green-600">
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">No Issues</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              GLTF Validator for USD
            </h1>
            {uploadedFile && (
              <p className="text-sm text-gray-600 mt-1">
                {uploadedFile.name}
              </p>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Upload Button */}
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Choose File
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                className="sr-only"
                accept=".gltf,.glb,.bin,.png,.jpg,.jpeg,.webp"
                onChange={handleFileUpload}
                disabled={isValidating}
                multiple
              />
            </label>
            
            {/* Status and Results Button */}
            {uploadedFile && !isValidating && (
              <div className="flex items-center space-x-3">
                {getStatusIcon()}
                {hasIssues && (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    View Details
                  </button>
                )}
              </div>
            )}
            
            {/* Loading */}
            {isValidating && (
              <div className="flex items-center space-x-2 text-blue-600">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-sm font-medium">Analyzing...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-full">
        {uploadedFile ? (
          // Full screen 3D Viewer
          <div className="h-full">
            <GLTFViewer
              file={uploadedFile}
              supportFiles={uploadedFiles}
              className="w-full h-full"
              showNegativeFaces={showNegativeFaces}
            />
            
            {/* Polygon and Mesh Count Display */}
            {(polygonCount !== null || meshCount !== null) && (
              <div className="absolute top-20 left-4 bg-black bg-opacity-75 text-white text-sm rounded-lg p-3">
                {polygonCount !== null && (
                  <>
                    <div className="font-medium">📊 Polygon Count</div>
                    <div className="text-lg font-bold mt-1">{polygonCount.toLocaleString()}</div>
                  </>
                )}
                {meshCount !== null && (
                  <>
                    <div className="font-medium mt-3">🔷 Mesh Count</div>
                    <div className="text-lg font-bold mt-1">{meshCount.toLocaleString()}</div>
                  </>
                )}
              </div>
            )}
            
            {/* Face Direction Check */}
            {uploadedFile && !isValidating && (
              <div className="absolute top-20 right-4 bg-black bg-opacity-75 text-white text-sm rounded-lg p-3 max-w-xs">
                <label className="cursor-pointer">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={showNegativeFaces}
                      onChange={(e) => setShowNegativeFaces(e.target.checked)}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="font-medium">Face Orientation Check</span>
                  </div>
                  <div className="text-xs text-gray-300 mt-1 leading-relaxed">
                    Highlight negative faces in red. Note: Red highlighted areas may appear transparent in some cases.
                  </div>
                </label>
              </div>
            )}
            
            {/* Floating Controls Info */}
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white text-xs rounded-lg p-3 max-w-xs">
              <div className="font-medium mb-2">🎮 Controls</div>
              <div className="space-y-1">
                <div><strong>🔄 Rotate:</strong> Left Click + Drag</div>
                <div><strong>🔍 Zoom:</strong> Mouse Wheel</div>
                <div><strong>📱 Pan:</strong> Right Click + Drag</div>
                <div><strong>📏 Dolly:</strong> Middle Click + Drag</div>
              </div>
            </div>
          </div>
        ) : (
          // Upload Area
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center">
              <svg
                className="mx-auto h-24 w-24 text-gray-400 mb-6"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h2 className="text-2xl font-medium text-gray-900 mb-4">
                Upload GLTF/GLB File
              </h2>
              <p className="text-gray-600 mb-8">
                Select a file to start quality checks for USD environments
              </p>
              <label
                htmlFor="file-upload-main"
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
              >
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Choose File
                <input
                  id="file-upload-main"
                  name="file-upload-main"
                  type="file"
                  className="sr-only"
                  accept=".gltf,.glb,.bin,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileUpload}
                  disabled={isValidating}
                  multiple
                />
              </label>
              <p className="text-xs text-gray-500 mt-4">
                Supported formats: .gltf, .glb (+ .bin, .png, .jpg, .webp)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Validation Modal */}
      <ValidationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        results={results}
      />
    </div>
  );
}