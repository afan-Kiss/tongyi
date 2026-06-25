export const LICENSE_DISABLED_MESSAGE = '软件不可用，请联系17364583794 同V'

export type LicenseInfo = {
  allowed: boolean
  message: string
  switchValue?: '开' | '关' | null
}

export const defaultLicenseInfo = (): LicenseInfo => ({
  allowed: true,
  message: '',
  switchValue: null,
})
