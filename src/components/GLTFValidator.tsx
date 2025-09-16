'use client';

import { useState } from 'react';
import * as THREE from 'three';

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

  const validateGLTF = async (file: File) => {
    setIsValidating(true);
    const validationResults: ValidationResult[] = [];

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 動的インポートでGLTFLoaderを読み込み
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();

      loader.parse(arrayBuffer, '', (gltf) => {
        const scene = gltf.scene;
        const animations = gltf.animations;

        validateTextures(scene, validationResults);
        validatePolygonCount(scene, validationResults);
        validateScaleValues(scene, validationResults);
        validateNormals(scene, validationResults);
        validateAnimations(animations, scene, validationResults);
        validateMeshHierarchy(scene, validationResults);

        setResults(validationResults);
        onValidationComplete?.(validationResults);
        setIsValidating(false);
      }, (error) => {
        validationResults.push({
          type: 'error',
          message: 'GLTFファイルの読み込みに失敗しました',
          details: error.toString()
        });
        setResults(validationResults);
        setIsValidating(false);
      });
    } catch (error) {
      validationResults.push({
        type: 'error',
        message: 'ファイルの処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : String(error)
      });
      setResults(validationResults);
      setIsValidating(false);
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
      if (texture.image && texture.image.src) {
        const src = texture.image.src.toLowerCase();
        if (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png')) {
          results.push({
            type: 'warning',
            message: 'テクスチャ形式の最適化推奨',
            details: `JPEG/PNGテクスチャをWebP形式に変換することで、ファイルサイズを削減できます。`
          });
        }
      }
    });
  };

  const validatePolygonCount = (scene: THREE.Object3D, results: ValidationResult[]) => {
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
        message: 'ポリゴン数が多すぎます',
        details: `現在のポリゴン数: ${Math.round(totalPolygons).toLocaleString()}。パフォーマンス向上のため50,000以下に削減することを推奨します。`
      });
    } else {
      results.push({
        type: 'info',
        message: 'ポリゴン数チェック',
        details: `総ポリゴン数: ${Math.round(totalPolygons).toLocaleString()}`
      });
    }
  };

  const validateScaleValues = (scene: THREE.Object3D, results: ValidationResult[]) => {
    scene.traverse((child) => {
      if (child.scale.x < 0 || child.scale.y < 0 || child.scale.z < 0) {
        results.push({
          type: 'warning',
          message: 'Scaleにマイナス値が設定されています',
          details: `オブジェクト "${child.name || '名前なし'}" のScaleにマイナス値があります。オブジェクトが崩れる可能性があります。`
        });
      }
    });
  };

  const validateNormals = (scene: THREE.Object3D, results: ValidationResult[]) => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const normals = child.geometry.attributes.normal;
        if (normals) {
          const normalArray = normals.array;
          for (let i = 0; i < normalArray.length; i += 3) {
            const x = normalArray[i];
            const y = normalArray[i + 1];
            const z = normalArray[i + 2];
            
            if (x < 0 || y < 0 || z < 0) {
              results.push({
                type: 'warning',
                message: '法線にマイナス値が検出されました',
                details: `メッシュ "${child.name || '名前なし'}" の法線にマイナス値があります。レンダリングに問題が発生する可能性があります。`
              });
              break;
            }
          }
        }
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
                message: 'Scaleアニメーションの開始値が0です',
                details: `アニメーション "${clip.name}" でScaleの開始値が0に設定されています。オブジェクトが崩れる可能性があります。`
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
            message: '深い階層のメッシュ',
            details: `メッシュ "${child.name || '名前なし'}" は深い階層（${depth}レベル）にあります。パフォーマンスに影響する可能性があります。`
          });
        }
      }
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.gltf') || file.name.toLowerCase().endsWith('.glb')) {
        validateGLTF(file);
      } else {
        setResults([{
          type: 'error',
          message: 'サポートされていないファイル形式です',
          details: 'GLTF（.gltf）またはGLB（.glb）ファイルをアップロードしてください。'
        }]);
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          GLTF Validator for USD
        </h1>
        
        <div className="mb-8">
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-4">
            GLTF/GLBファイルをアップロード
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-blue-400 transition-colors">
            <div className="space-y-1 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
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
              <div className="flex text-sm text-gray-600">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                >
                  <span>ファイルを選択</span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".gltf,.glb"
                    onChange={handleFileUpload}
                    disabled={isValidating}
                  />
                </label>
                <p className="pl-1">またはドラッグ&ドロップ</p>
              </div>
              <p className="text-xs text-gray-500">GLTF, GLB形式のファイル</p>
            </div>
          </div>
        </div>

        {isValidating && (
          <div className="mb-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">バリデーション中...</span>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              バリデーション結果
            </h2>
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-md border-l-4 ${
                  result.type === 'error'
                    ? 'bg-red-50 border-red-400'
                    : result.type === 'warning'
                    ? 'bg-yellow-50 border-yellow-400'
                    : 'bg-blue-50 border-blue-400'
                }`}
              >
                <div className="flex">
                  <div className="flex-shrink-0">
                    {result.type === 'error' ? (
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : result.type === 'warning' ? (
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="ml-3">
                    <h3
                      className={`text-sm font-medium ${
                        result.type === 'error'
                          ? 'text-red-800'
                          : result.type === 'warning'
                          ? 'text-yellow-800'
                          : 'text-blue-800'
                      }`}
                    >
                      {result.message}
                    </h3>
                    {result.details && (
                      <div
                        className={`mt-2 text-sm ${
                          result.type === 'error'
                            ? 'text-red-700'
                            : result.type === 'warning'
                            ? 'text-yellow-700'
                            : 'text-blue-700'
                        }`}
                      >
                        {result.details}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}