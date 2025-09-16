import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GLTF Validator for USD | 3D Model Validation Tool",
  description: "Online validation tool to check GLTF/GLB file quality. Analyze textures, polygon count, animations, and materials in detail to ensure USD compatibility.",
  keywords: ["GLTF", "GLB", "USD", "3D", "validator", "3D model", "texture", "polygon", "animation", "validation", "quality check"],
  authors: [{ name: "GLTF Validator Team" }],
  creator: "GLTF Validator for USD",
  publisher: "GLTF Validator for USD",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://gltf-validator-for-usd.vercel.app'),
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://gltf-validator-for-usd.vercel.app',
    title: 'GLTF Validator for USD | 3D Model Validation Tool',
    description: 'Online validation tool to check GLTF/GLB file quality. Analyze textures, polygon count, animations, and materials in detail to ensure USD compatibility.',
    siteName: 'GLTF Validator for USD',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'GLTF Validator for USD - 3D Model Validation Tool',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GLTF Validator for USD | 3D Model Validation Tool',
    description: 'Online validation tool to check GLTF/GLB file quality. Analyze textures, polygon count, animations, and materials in detail to ensure USD compatibility.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "GLTF Validator for USD",
              "description": "Online validation tool to check GLTF/GLB file quality. Analyze textures, polygon count, animations, and materials in detail to ensure USD compatibility.",
              "url": "https://gltf-validator-for-usd.vercel.app",
              "applicationCategory": "DeveloperApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "featureList": [
                "GLTF/GLB file validation",
                "Texture analysis",
                "Polygon count checking",
                "Animation validation",
                "USD compatibility verification"
              ],
              "inLanguage": "en",
              "creator": {
                "@type": "Organization",
                "name": "GLTF Validator Team"
              }
            })
          }}
        />
        {children}
      </body>
    </html>
  );
}
