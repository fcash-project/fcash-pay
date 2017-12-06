import { Component, ViewChild } from '@angular/core';
import { NavController, Slides, Navbar, AlertController, NavParams } from 'ionic-angular';
import { DisclaimerPage } from '../../onboarding/disclaimer/disclaimer';
import { ProfileProvider } from '../../../providers/profile/profile';
import { WalletProvider } from '../../../providers/wallet/wallet';
import { BwcProvider } from '../../../providers/bwc/bwc';
import { Logger } from '@nsalaun/ng-logger';
import * as _ from 'lodash';

@Component({
  selector: 'page-backup-game',
  templateUrl: 'backup-game.html',
})
export class BackupGamePage {
  @ViewChild(Slides) slides: Slides;
  @ViewChild(Navbar) navBar: Navbar;

  private fromOnboarding: boolean;

  public currentIndex: number;
  public deleted: boolean;
  public mnemonicWords: Array<String>;
  public shuffledMnemonicWords: Array<any>;
  public passphrase: String;
  public customWords: Array<any>;
  public selectComplete: boolean;
  public error: boolean;
  public credentialsEncrypted: boolean;

  private mnemonicHasPassphrase: any;
  private data: any;
  private walletId: string;
  private wallet: any;
  private keys: any;
  private useIdeograms: any;

  constructor(
    private navCtrl: NavController,
    private navParams: NavParams,
    private alertCtrl: AlertController,
    private logger: Logger,
    private profileProvider: ProfileProvider,
    private walletProvider: WalletProvider,
    private bwcProvider: BwcProvider
  ) {
    this.walletId = this.navParams.get('walletId');
    this.fromOnboarding = this.navParams.get('fromOnboarding');
    this.wallet = this.profileProvider.getWallet(this.walletId);
    this.credentialsEncrypted = this.wallet.isPrivKeyEncrypted();

    this.deleted = this.isDeletedSeed();
    if (this.deleted) {
      this.logger.debug('no mnemonics');
      return;
    }

    this.walletProvider.getKeys(this.wallet).then((keys) => {
      if (_.isEmpty(keys)) {
        this.logger.error('Empty keys');
      }
      this.credentialsEncrypted = false;
      this.keys = keys;
      this.setFlow();
    }).catch((err) => {
      this.logger.error('Could not get keys: ', err);
    });
  }

  ngOnInit() {
    this.currentIndex = 0;
    this.navBar.backButtonClick = (e: UIEvent) => {
      this.slidePrev();
    }
  }

  ionViewDidLoad() {
    this.slides.lockSwipes(true);
  }

  private shuffledWords(words: Array<String>) {
    var sort = _.sortBy(words);

    return _.map(sort, (w) => {
      return {
        word: w,
        selected: false
      };
    });
  };

  public addButton(index: number, item: any): void {
    var newWord = {
      word: item.word,
      prevIndex: index
    };
    this.customWords.push(newWord);
    this.shuffledMnemonicWords[index].selected = true;
    this.shouldContinue();
  };

  public removeButton(index: number, item: any): void {
    // if ($scope.loading) return;
    this.customWords.splice(index, 1);
    this.shuffledMnemonicWords[item.prevIndex].selected = false;
    this.shouldContinue();
  };

  private shouldContinue() {
    if (this.customWords.length == this.shuffledMnemonicWords.length)
      this.selectComplete = true;
    else
      this.selectComplete = false;
  };

  private backupError(err: any) {
    // ongoingProcess.set('validatingWords', false);
    this.logger.error('Failed to verify backup: ', err);
    this.error = true;
    let showError = this.alertCtrl.create({
      title: "Failed to verify backup",
      subTitle: err,
      buttons: [{
        text: 'Try again',
        role: 'cancel',
        handler: () => {
          this.setFlow();
        }
      }]
    });
    showError.present();
  };

  private showBackupResult() {
    if (this.error) {
      let alert = this.alertCtrl.create({
        title: "Uh oh...",
        subTitle: "It's important that you write your backup phrase down correctly. If something happens to your wallet, you'll need this backup to recover your money. Please review your backup and try again.",
        buttons: [{
          text: 'Ok',
          role: 'cancel',
          handler: () => {
            this.setFlow();
          }
        }]
      });
      alert.present();
    } else {
      let opts = {
        title: 'Your bitcoin wallet is backed up!',
        message: 'Be sure to store your recovery phrase in a secure place. If this app is deleted, your money cannot be recovered without it.',
        buttons: [{
          text: 'Got it',
          handler: () => {
            if (this.fromOnboarding) {
              this.navCtrl.push(DisclaimerPage);
            } else {
              this.navCtrl.popToRoot();
            }
          }
        }],
      }
      this.alertCtrl.create(opts).present();
    }
  };

  private isDeletedSeed() {
    if (!this.wallet.credentials.mnemonic && !this.wallet.credentials.mnemonicEncrypted)
      return true;

    return false;
  }

  private slidePrev() {
    this.slides.lockSwipes(false);
    if (this.currentIndex == 0) this.navCtrl.pop();
    else {
      this.slides.slidePrev();
      this.currentIndex = this.slides.getActiveIndex();
    }
    this.slides.lockSwipes(true);
  }

  public slideNext(): void {
    if (this.currentIndex == 1 && !this.mnemonicHasPassphrase)
      this.finalStep();
    else {
      this.slides.lockSwipes(false);
      this.slides.slideNext();
    }

    this.currentIndex = this.slides.getActiveIndex();
    this.slides.lockSwipes(true);
  }

  private setFlow() {
    if (!this.keys) return;

    let words = this.keys.mnemonic;
    this.data = {};

    this.mnemonicWords = words.split(/[\u3000\s]+/);
    this.shuffledMnemonicWords = this.shuffledWords(this.mnemonicWords);
    this.mnemonicHasPassphrase = this.wallet.mnemonicHasPassphrase();
    this.useIdeograms = words.indexOf("\u3000") >= 0;
    this.data['passphrase'] = null;
    this.customWords = [];
    this.selectComplete = false;
    this.error = false;

    words = _.repeat('x', 300);

    if (this.currentIndex == 2) this.slidePrev();

  };


  /* TODO: check if this function is necessary
  private copyRecoveryPhrase = function () {
    if (this.wallet.network == 'livenet') return null;
    else if (!this.wallet.credentials.mnemonic) return null;
    else return this.wallet.credentials.mnemonic;
  };*/

  private confirm() {
    return new Promise((resolve, reject) => {
      this.error = false;

      let customWordList = _.map(this.customWords, 'word');

      if (!_.isEqual(this.mnemonicWords, customWordList)) {
        return reject('Mnemonic string mismatch');
      }

      if (this.mnemonicHasPassphrase) {
        let walletClient = this.bwcProvider.getClient();
        let separator = this.useIdeograms ? '\u3000' : ' ';
        let customSentence = customWordList.join(separator);
        let passphrase = this.data.passphrase || '';

        try {
          walletClient.seedFromMnemonic(customSentence, {
            network: this.wallet.credentials.network,
            passphrase: passphrase,
            account: this.wallet.credentials.account
          });
        } catch (err) {
          walletClient.credentials.xPrivKey = _.repeat('x', 64);
          return reject(err);
        }

        if (walletClient.credentials.xPrivKey.substr(walletClient.credentials.xPrivKey) != this.keys.xPrivKey) {
          delete walletClient.credentials;
          return reject('Private key mismatch');
        }
      }

      this.profileProvider.setBackupFlag(this.wallet.credentials.walletId);
      return resolve();
    });
  };

  private finalStep() {
    //ongoingProcess.set('validatingWords', true);
    this.confirm().then(() => {
      //ongoingProcess.set('validatingWords', false);
      this.showBackupResult();
    }).catch((err) => {
      this.backupError(err);
    });
  };

}