-- CreateTable
CREATE TABLE "IntentoLogin" (
    "clave" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL,
    "reiniciaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntentoLogin_pkey" PRIMARY KEY ("clave")
);
